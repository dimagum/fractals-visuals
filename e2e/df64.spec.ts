import { expect, test } from '@playwright/test';
import { DF64 } from '../src/shaders';

/**
 * Прогоняет примитивы double-float на настоящем GPU-конвейере браузера и
 * сверяет с double из JavaScript. Ловит регрессии вроде той, когда
 * оптимизатор шейдеров сокращал поправочные члены и точность падала до float32.
 */

type Op = 'add' | 'mul';

const split = (x: number): [number, number] => {
  const hi = Math.fround(x);
  return [hi, Math.fround(x - hi)];
};

// Детерминированный набор чисел порядка единицы с «хвостами» за пределами float32.
const inputs: [number, number][] = Array.from({ length: 16 }, (_, i) => {
  const a = Math.sin(i * 12.9898 + 1.234) * 1.7 + 1e-9 * Math.cos(i * 4.1);
  const b = Math.cos(i * 78.233 + 0.5) * 0.9 - 3e-10 * Math.sin(i * 2.7);
  return [a, b];
});

async function runOnGpu(page: import('@playwright/test').Page, op: Op): Promise<number[][]> {
  await page.setContent('<canvas></canvas>');
  return page.evaluate(
    ({ source, op, values }) => {
      const canvas = document.querySelector('canvas')!;
      const gl = canvas.getContext('webgl2');
      if (!gl) throw new Error('WebGL2 недоступен');
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('нет EXT_color_buffer_float');

      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, gl.createFramebuffer());
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindVertexArray(gl.createVertexArray());

      const vs = `#version 300 es
        void main() {
          vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
          gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }`;
      const fs = `#version 300 es
        precision highp float;
        precision highp int;
        uniform int u_zero;
        uniform vec4 u_in;
        out vec4 outColor;
        ${source}
        void main() {
          outColor = vec4(${op === 'add' ? 'dfAdd' : 'dfMul'}(u_in.xy, u_in.zw), 0.0, 0.0);
        }`;
      const program = gl.createProgram()!;
      for (const [type, src] of [
        [gl.VERTEX_SHADER, vs],
        [gl.FRAGMENT_SHADER, fs],
      ] as const) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? '');
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      gl.useProgram(program);
      gl.viewport(0, 0, 1, 1);
      gl.uniform1i(gl.getUniformLocation(program, 'u_zero'), 0);

      const out = new Float32Array(4);
      return values.map((v) => {
        gl.uniform4fv(gl.getUniformLocation(program, 'u_in'), v);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
        return [out[0]!, out[1]!];
      });
    },
    {
      source: DF64,
      op,
      values: inputs.map(([a, b]) => [...split(a), ...split(b)]),
    },
  );
}

for (const op of ['add', 'mul'] as const) {
  test(`df64 ${op} на GPU точнее float32 на шесть порядков`, async ({ page }) => {
    const results = await runOnGpu(page, op);
    results.forEach(([hi, lo], i) => {
      const [a, b] = inputs[i]!;
      // Сравниваем с операцией над уже округлёнными до df64 входами.
      const [ah, al] = split(a);
      const [bh, bl] = split(b);
      const x = ah + al;
      const y = bh + bl;
      const expected = op === 'add' ? x + y : x * y;
      const error = Math.abs(hi! + lo! - expected);
      expect(error, `вход #${i}: ${x} ${op} ${y}`).toBeLessThan(1e-13 * Math.max(1, Math.abs(expected)));
    });
  });
}
