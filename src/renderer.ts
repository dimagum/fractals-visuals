import { effectiveIterations, parseSequence, type FractalDef, type FractalParams, type View } from './fractals';
import { bakeGradient, hexToRgb, type PaletteColors } from './palettes';
import { MAX_DEGREE, findPolynomial, findRoots, type Complex } from './polynomial';
import { BLIT_FRAGMENT, VERTEX_SHADER, fragmentSource } from './shaders';

export interface DrawParams {
  fractal: FractalDef;
  view: View;
  iterations: number;
  density: number;
  /** Степень d; у фракталов без этой ручки всегда 2. */
  power: number;
  /** c для Жюлиа или (p, q) для Феникса. */
  param: [number, number];
  /** 0 = A, 1 = B. */
  sequence: number[];
  poly: { coeffs: number[]; roots: Complex[] };
}

const rootsCache = new Map<string, Complex[]>();

/** Собирает параметры кадра из значений ручек — общий путь для карты, превью и экспорта. */
export function drawParamsFor(
  def: FractalDef,
  view: View,
  params: FractalParams,
  iterBase: number,
  density: number,
): DrawParams {
  const poly = findPolynomial(params.poly);
  let roots = rootsCache.get(poly.id);
  if (!roots) {
    roots = findRoots(poly.coeffs);
    rootsCache.set(poly.id, roots);
  }
  return {
    fractal: def,
    view,
    iterations: effectiveIterations(def, iterBase, view.span),
    density,
    power: def.controls.includes('power') ? params.power : 2,
    param: params.param,
    sequence: parseSequence(params.sequence) ?? [0, 1],
    poly: { coeffs: poly.coeffs, roots },
  };
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

const FRACTAL_UNIFORMS = [
  'u_resolution',
  'u_centerHi',
  'u_centerLo',
  'u_pixel',
  'u_flip',
  'u_maxIter',
  'u_density',
  'u_palette',
  'u_inside',
  'u_param',
  'u_power',
  'u_seq',
  'u_seqLen',
  'u_coeffs',
  'u_degree',
  'u_roots',
  'u_zero',
];

const MAX_SEQUENCE = 16;

/**
 * Нужна ли эмуляция double: когда пиксель становится сравним с шагом сетки
 * float32 (~1.2e-7 от модуля координаты), картинка начинает рассыпаться на блоки.
 */
export function needsDeep(fractal: FractalDef, view: View, heightPx: number): boolean {
  const magnitude = Math.max(1, Math.abs(view.cx) + Math.abs(view.cy));
  return fractal.deep && view.span / heightPx < 4e-6 * magnitude;
}

/**
 * Обёртка над WebGL2: компилирует программы фракталов по требованию, держит
 * текстуру палитры и умеет рисовать кадр целиком, полосой строк или в
 * уменьшенном разрешении (для плавности во время перетаскивания).
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private readonly programs = new Map<string, Program>();
  private readonly blit: Program;
  private readonly paletteTex: WebGLTexture;
  private inside: [number, number, number] = [0, 0, 0];
  private lowTex: WebGLTexture | null = null;
  private lowFbo: WebGLFramebuffer | null = null;
  private lowSize: [number, number] = [0, 0];
  private readonly seqBuffer = new Int32Array(MAX_SEQUENCE);
  private readonly coeffBuffer = new Float32Array(MAX_DEGREE + 1);
  private readonly rootBuffer = new Float32Array(MAX_DEGREE * 2);
  private readonly syncPixel = new Uint8Array(4);

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // Полосы прогрессивного рендера дорисовываются поверх прошлого кадра.
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 не поддерживается этим браузером');
    this.gl = gl;
    // Полноэкранный треугольник не использует атрибутов, но VAO должен быть привязан.
    gl.bindVertexArray(gl.createVertexArray());
    this.blit = this.compile(BLIT_FRAGMENT, ['u_image', 'u_resolution']);

    this.paletteTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Зеркальный повтор: палитра «качается» туда-обратно без шва на стыке.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setPalette(colors: PaletteColors): void {
    const gl = this.gl;
    const size = 512;
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bakeGradient(colors.stops, size));
    this.inside = hexToRgb(colors.inside);
  }

  /** Кадр в полном разрешении холста; `rows` — полоса строк [y0, y1) в координатах GL. */
  draw(params: DrawParams, rows?: [number, number]): void {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    if (rows) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, rows[0], width, rows[1] - rows[0]);
    }
    this.drawFractal(params, width, height);
    gl.disable(gl.SCISSOR_TEST);
  }

  /** Кадр в разрешении `scale` от холста, растянутый на весь холст. */
  drawLowRes(params: DrawParams, scale: number): void {
    const gl = this.gl;
    const { width, height } = this.canvas;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    this.ensureLowTarget(w, h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lowFbo);
    gl.viewport(0, 0, w, h);
    this.drawFractal(params, w, h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.blit.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.lowTex);
    gl.uniform1i(this.blit.uniforms.get('u_image')!, 0);
    gl.uniform2f(this.blit.uniforms.get('u_resolution')!, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Дожидается окончания работы GPU — нужно для честного замера времени кадра. */
  sync(): void {
    const gl = this.gl;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.syncPixel);
  }

  private drawFractal(params: DrawParams, width: number, height: number): void {
    const gl = this.gl;
    const { fractal, view } = params;
    const deep = needsDeep(fractal, view, height);
    const prog = this.program(fractal, deep);
    const u = prog.uniforms;
    gl.useProgram(prog.program);

    const hiX = Math.fround(view.cx);
    const hiY = Math.fround(view.cy);
    gl.uniform2f(u.get('u_resolution')!, width, height);
    gl.uniform2f(u.get('u_centerHi')!, hiX, hiY);
    gl.uniform2f(u.get('u_centerLo')!, view.cx - hiX, view.cy - hiY);
    gl.uniform1f(u.get('u_pixel')!, view.span / height);
    gl.uniform1f(u.get('u_flip')!, fractal.flipY ? -1 : 1);
    gl.uniform1i(u.get('u_maxIter')!, params.iterations);
    gl.uniform1f(u.get('u_density')!, params.density * fractal.colorScale);
    gl.uniform3f(u.get('u_inside')!, ...this.inside);
    gl.uniform2f(u.get('u_param')!, params.param[0], params.param[1]);
    gl.uniform1i(u.get('u_power')!, params.power);

    this.coeffBuffer.fill(0);
    this.coeffBuffer.set(params.poly.coeffs);
    this.rootBuffer.fill(0);
    this.rootBuffer.set(params.poly.roots.flat());
    gl.uniform1fv(u.get('u_coeffs')!, this.coeffBuffer);
    gl.uniform1i(u.get('u_degree')!, params.poly.coeffs.length - 1);
    gl.uniform2fv(u.get('u_roots')!, this.rootBuffer);
    gl.uniform1i(u.get('u_zero')!, 0);

    const seq = params.sequence.slice(0, MAX_SEQUENCE);
    this.seqBuffer.fill(0);
    this.seqBuffer.set(seq);
    gl.uniform1iv(u.get('u_seq')!, this.seqBuffer);
    gl.uniform1i(u.get('u_seqLen')!, Math.max(1, seq.length));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(u.get('u_palette')!, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private program(fractal: FractalDef, deep: boolean): Program {
    const key = `${fractal.id}:${deep ? 'df64' : 'fp32'}`;
    let prog = this.programs.get(key);
    if (!prog) {
      prog = this.compile(fragmentSource(fractal.id, deep), FRACTAL_UNIFORMS);
      this.programs.set(key, prog);
    }
    return prog;
  }

  private compile(fragment: string, uniforms: string[]): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.shader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, this.shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Не удалось слинковать шейдер: ${gl.getProgramInfoLog(program)}`);
    }
    return {
      program,
      uniforms: new Map(uniforms.map((name) => [name, gl.getUniformLocation(program, name)])),
    };
  }

  private shader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Ошибка компиляции шейдера: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  private ensureLowTarget(w: number, h: number): void {
    const gl = this.gl;
    if (this.lowTex && this.lowSize[0] === w && this.lowSize[1] === h) return;
    if (!this.lowTex) {
      this.lowTex = gl.createTexture();
      this.lowFbo = gl.createFramebuffer();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.lowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lowTex, 0);
    this.lowSize = [w, h];
  }
}
