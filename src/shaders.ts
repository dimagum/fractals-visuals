import type { FractalId } from './fractals';

/**
 * GLSL-исходники. Каждый фрактал — отдельная фрагментная программа, которая
 * считает цвет одного пикселя. Координата пикселя восстанавливается из центра
 * вида (передаётся парой hi/lo, чтобы не терять точность double) и смещения
 * от центра в пикселях.
 */

export const VERTEX_SHADER = /* glsl */ `#version 300 es
// Один треугольник, накрывающий весь экран; вершины берутся из gl_VertexID.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform vec2 u_resolution;
uniform vec2 u_centerHi;
uniform vec2 u_centerLo;
uniform float u_pixel;      // размер пикселя в единицах плоскости
uniform float u_flip;       // 1.0 или -1.0 для оси Im вниз
uniform int u_maxIter;
uniform float u_density;    // плотность окраски
uniform sampler2D u_palette;
uniform vec3 u_inside;
uniform vec2 u_param;       // c для Жюлиа или (p, q) для Феникса
uniform vec2 u_paramLo;     // младшая часть c для df64: c = u_param + u_paramLo
uniform int u_power;        // степень d в zᵈ + c
uniform int u_seq[16];      // последовательность Ляпунова: 0 = A, 1 = B
uniform int u_seqLen;
uniform float u_coeffs[9];  // многочлен Ньютона: a₀ … a₈
uniform int u_degree;
uniform vec2 u_roots[8];    // его корни, найденные на CPU
uniform int u_zero;         // всегда 0 — барьер для оптимизатора в df64

out vec4 outColor;

const float BAILOUT2 = 65536.0; // |z| > 256: большой радиус делает сглаживание точным

vec2 pixelOffset() {
  vec2 o = (gl_FragCoord.xy - 0.5 * u_resolution) * u_pixel;
  o.y *= u_flip;
  return o;
}

vec3 paletteAt(float t) {
  return texture(u_palette, vec2(t, 0.5)).rgb;
}

vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }

// zᵈ повторным умножением: для целых d это точнее и дешевле, чем через exp/log.
vec2 cpow(vec2 z, int d) {
  vec2 r = z;
  for (int k = 1; k < d; k++) r = cmul(r, z);
  return r;
}

// Нормализованное число итераций: ν = n + 1 − log_d(ln|z|). При zᵈ модуль
// за шаг возводится в степень d, поэтому логарифм берётся по основанию d.
float smoothIter(float n, float r2) {
  return n + 1.0 - log2(0.5 * log(r2)) / log2(float(u_power));
}

vec3 escapeColor(float nu) {
  return paletteAt(sqrt(max(nu, 0.0)) * 0.16 * u_density);
}
`;

/**
 * Арифметика double-float: число хранится как сумма двух float (hi + lo),
 * что даёт ~48 бит мантиссы вместо 24 (алгоритмы Деккера и Кнута).
 *
 * Эти алгоритмы держатся на точном порядке округлений: (s − a) должно быть
 * посчитано и округлено именно так, как написано. Компиляторы шейдеров
 * (особенно Metal с fast-math) переставляют сложения и сокращают поправки
 * до нуля. Барьер B() прогоняет число через XOR битов с uniform-нулём: для
 * компилятора результат непрозрачен, и переставить операции через него нельзя.
 */
export const DF64 = /* glsl */ `
float B(float x) { return intBitsToFloat(floatBitsToInt(x) ^ u_zero); }

vec2 quickTwoSum(float a, float b) {
  float s = B(a + b);
  float e = B(b - B(s - a));
  return vec2(s, e);
}

vec2 twoSum(float a, float b) {
  float s = B(a + b);
  float v = B(s - a);
  float e = B(B(a - B(s - v)) + B(b - v));
  return vec2(s, e);
}

vec2 splitF(float a) {
  float t = B(a * 4097.0);
  float hi = B(t - B(t - a));
  return vec2(hi, B(a - hi));
}

vec2 twoProd(float a, float b) {
  float p = B(a * b);
  vec2 x = splitF(a);
  vec2 y = splitF(b);
  float err = B(B(B(B(x.x * y.x - p) + x.x * y.y) + x.y * y.x) + x.y * y.y);
  return vec2(p, err);
}

vec2 dfAdd(vec2 a, vec2 b) {
  vec2 s = twoSum(a.x, b.x);
  vec2 t = twoSum(a.y, b.y);
  s = quickTwoSum(s.x, B(s.y + t.x));
  return quickTwoSum(s.x, B(s.y + t.y));
}

vec2 dfSub(vec2 a, vec2 b) { return dfAdd(a, -b); }

vec2 dfMul(vec2 a, vec2 b) {
  vec2 p = twoProd(a.x, b.x);
  return quickTwoSum(p.x, B(p.y + B(B(a.x * b.y) + B(a.y * b.x))));
}

vec2 dfAbs(vec2 a) { return a.x < 0.0 ? -a : a; }
`;

type EscapeVariant = 'mandelbrot' | 'julia' | 'burning-ship' | 'tricorn';

/** Мандельброт, Жюлиа, Burning Ship и Трикорн в обычной точности float32. */
function escapeFp32(variant: EscapeVariant): string {
  const init =
    variant === 'julia'
      ? 'vec2 z = p; vec2 c = u_param;'
      : 'vec2 z = vec2(0.0); vec2 c = p;';
  // При d = 2 квадрат раскрыт вручную — это самый частый и самый горячий случай.
  const step = {
    mandelbrot: 'z = (u_power == 2 ? vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) : cpow(z, u_power)) + c;',
    julia: 'z = (u_power == 2 ? vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) : cpow(z, u_power)) + c;',
    'burning-ship': 'z = vec2(z.x * z.x - z.y * z.y, 2.0 * abs(z.x * z.y)) + c;',
    // Сопряжение перед возведением в степень: z̄ᵈ.
    tricorn: 'z = (u_power == 2 ? vec2(z.x * z.x - z.y * z.y, -2.0 * z.x * z.y) : cpow(vec2(z.x, -z.y), u_power)) + c;',
  }[variant];
  // Главная кардиоида и круг периода 2 целиком внутри множества — их можно не итерировать.
  const precheck =
    variant === 'mandelbrot'
      ? `
  float qx = c.x - 0.25;
  float q = qx * qx + c.y * c.y;
  if (u_power == 2 && (q * (q + qx) <= 0.25 * c.y * c.y || (c.x + 1.0) * (c.x + 1.0) + c.y * c.y <= 0.0625)) {
    outColor = vec4(u_inside, 1.0);
    return;
  }`
      : '';
  return `${PRELUDE}
void main() {
  vec2 p = u_centerHi + (u_centerLo + pixelOffset());
  ${init}
  ${precheck}
  for (int i = 0; i < u_maxIter; i++) {
    ${step}
    float r2 = dot(z, z);
    if (r2 > BAILOUT2) {
      outColor = vec4(escapeColor(smoothIter(float(i), r2)), 1.0);
      return;
    }
  }
  outColor = vec4(u_inside, 1.0);
}
`;
}

/** Те же фракталы с координатами в double-float — для глубокого зума. */
function escapeDf64(variant: EscapeVariant): string {
  const init =
    variant === 'julia'
      ? 'vec2 zx = px; vec2 zy = py; vec2 cx = vec2(u_param.x, u_paramLo.x); vec2 cy = vec2(u_param.y, u_paramLo.y);'
      : 'vec2 zx = vec2(0.0); vec2 zy = vec2(0.0); vec2 cx = px; vec2 cy = py;';
  const cross = variant === 'burning-ship' ? 'dfAbs(dfMul(zx, zy))' : 'dfMul(zx, zy)';
  const crossSign = variant === 'tricorn' ? '-2.0' : '2.0';
  // Степень d > 2 — повторное комплексное умножение в double-float.
  const general =
    variant === 'burning-ship'
      ? ''
      : `
    if (u_power != 2) {
      vec2 bx = zx;
      vec2 by = ${variant === 'tricorn' ? '-zy' : 'zy'};
      vec2 rx = bx;
      vec2 ry = by;
      for (int k = 1; k < u_power; k++) {
        vec2 nx = dfSub(dfMul(rx, bx), dfMul(ry, by));
        ry = dfAdd(dfMul(rx, by), dfMul(ry, bx));
        rx = nx;
      }
      zx = dfAdd(rx, cx);
      zy = dfAdd(ry, cy);
    } else`;
  return `${PRELUDE}${DF64}
void main() {
  vec2 o = pixelOffset();
  vec2 px = dfAdd(vec2(u_centerHi.x, u_centerLo.x), vec2(o.x, 0.0));
  vec2 py = dfAdd(vec2(u_centerHi.y, u_centerLo.y), vec2(o.y, 0.0));
  ${init}
  for (int i = 0; i < u_maxIter; i++) {${general} {
      vec2 x2 = dfMul(zx, zx);
      vec2 y2 = dfMul(zy, zy);
      vec2 xy = ${cross};
      zx = dfAdd(dfSub(x2, y2), cx);
      zy = dfAdd(${crossSign} * xy, cy);
    }
    float r2 = zx.x * zx.x + zy.x * zy.x;
    if (r2 > BAILOUT2) {
      outColor = vec4(escapeColor(smoothIter(float(i), r2)), 1.0);
      return;
    }
  }
  outColor = vec4(u_inside, 1.0);
}
`;
}

/**
 * Феникс (Усики, 1988): z_{n+1} = z_n² + p + q·z_{n−1} с вещественными p и q.
 * Его традиционно рисуют повёрнутым — «крыльями» в стороны, поэтому экранная
 * ось x здесь соответствует Im z₀, а ось y — Re z₀.
 */
const PHOENIX = /* glsl */ `${PRELUDE}
void main() {
  vec2 z = (u_centerHi + (u_centerLo + pixelOffset())).yx;
  vec2 prev = vec2(0.0);
  for (int i = 0; i < u_maxIter; i++) {
    vec2 next = vec2(z.x * z.x - z.y * z.y + u_param.x, 2.0 * z.x * z.y) + u_param.y * prev;
    prev = z;
    z = next;
    float r2 = dot(z, z);
    if (r2 > BAILOUT2) {
      outColor = vec4(escapeColor(smoothIter(float(i), r2)), 1.0);
      return;
    }
  }
  outColor = vec4(u_inside, 1.0);
}
`;

/** Метод Ньютона для многочлена до 8-й степени; p и p′ считаются схемой Горнера. */
const NEWTON = /* glsl */ `${PRELUDE}
const float TOL = 1e-5;

void main() {
  vec2 z = u_centerHi + (u_centerLo + pixelOffset());
  for (int i = 0; i < u_maxIter; i++) {
    vec2 p = vec2(u_coeffs[u_degree], 0.0);
    vec2 dp = vec2(0.0);
    for (int k = u_degree - 1; k >= 0; k--) {
      dp = cmul(dp, z) + p;
      p = cmul(p, z) + vec2(u_coeffs[k], 0.0);
    }
    if (dot(dp, dp) < 1e-30) break; // производная обнулилась — шаг не определён
    z -= cdiv(p, dp);
    for (int k = 0; k < u_degree; k++) {
      float d = distance(z, u_roots[k]);
      if (d < TOL) {
        // Сходимость квадратичная: ln d удваивается за шаг, отсюда дробная часть.
        float nu = float(i) + 1.0 - log2(log(max(d, 1e-30)) / log(TOL));
        float speed = exp(-nu * 0.09 * u_density);
        float t = (float(k) + 0.1 + 0.8 * (1.0 - speed)) / float(u_degree);
        outColor = vec4(paletteAt(t), 1.0);
        return;
      }
    }
  }
  // Не сошлось: притягивающий цикл (как у z³ − 2z + 2) или не хватило итераций.
  outColor = vec4(u_inside, 1.0);
}
`;

const LYAPUNOV = /* glsl */ `${PRELUDE}
void main() {
  vec2 ab = u_centerHi + (u_centerLo + pixelOffset());
  // Вне (0, 4] логистическое отображение уходит из [0, 1] — показатель не определён.
  if (ab.x <= 0.0 || ab.y <= 0.0 || ab.x > 4.0 || ab.y > 4.0) {
    outColor = vec4(paletteAt(0.0), 1.0);
    return;
  }
  int warmup = min(u_maxIter / 4, 300);
  float x = 0.5;
  int idx = 0;
  for (int i = 0; i < warmup; i++) {
    float r = u_seq[idx] == 0 ? ab.x : ab.y;
    x = r * x * (1.0 - x);
    idx = idx + 1 == u_seqLen ? 0 : idx + 1;
  }
  float sum = 0.0;
  for (int i = 0; i < u_maxIter; i++) {
    float r = u_seq[idx] == 0 ? ab.x : ab.y;
    sum += log(max(abs(r * (1.0 - 2.0 * x)), 1e-30));
    x = r * x * (1.0 - x);
    idx = idx + 1 == u_seqLen ? 0 : idx + 1;
  }
  float lambda = sum / float(u_maxIter);
  vec3 col;
  if (lambda < 0.0) {
    // Порядок: у самой границы с хаосом — светлый конец палитры, вглубь
    // устойчивой области (к сверхустойчивым линиям, λ → −∞) цвет сдвигается.
    col = paletteAt(0.96 - 0.8 * (1.0 - exp(lambda * 1.2 * u_density)));
  } else {
    // Хаос: почти цвет «внутренности», чуть светлее там, где λ близок к нулю.
    col = mix(paletteAt(0.1), u_inside, clamp(0.6 + lambda * 1.5, 0.0, 1.0));
  }
  outColor = vec4(col, 1.0);
}
`;

/**
 * Теория возмущений (Мандельброт и Жюлиа, d = 2). Опорная орбита Zₙ одной
 * точки посчитана на CPU в произвольной точности и лежит в текстуре; пиксель
 * считает лишь своё отклонение δzₙ = zₙ − Zₙ:
 *
 *   δzₙ₊₁ = 2·Zₙ·δzₙ + δzₙ² + δc = (2·Zₙ + δzₙ)·δzₙ + δc.
 *
 * Арифметика — df64: на ребейзинге z = Z + δz вычитаются близкие числа, и
 * точности float32 не хватает (сверка с BigInt-итерацией это показала).
 * Отклонения хранятся в масштабе S = 2ᵏ ≈ высоте кадра: δ' = δ / S. Так на
 * ×10³⁰ младшие части df64 не уходят в денормализованные числа. Умножение на
 * степень двойки точное.
 *
 * Ребейзинг (Чжоурань, 2021): если орбита пикселя подошла к нулю ближе, чем
 * к опорной, или опорная кончилась, опора начинается заново с Z₀ — так не
 * появляются «глитчи» и годится любая опорная точка.
 */
function perturbSource(variant: 'mandelbrot' | 'julia'): string {
  // Мандельброт: δz₀ = 0, δc = смещение. Жюлиа: δz₀ = смещение, δc = 0.
  const init =
    variant === 'julia'
      ? 'vec2 dzx = dpx; vec2 dzy = dpy; vec2 dcx = vec2(0.0); vec2 dcy = vec2(0.0);'
      : 'vec2 dzx = vec2(0.0); vec2 dzy = vec2(0.0); vec2 dcx = dpx; vec2 dcy = dpy;';
  return `${PRELUDE}${DF64}
uniform highp sampler2D u_ref;  // Zₙ: RGBA32F = (Re hi, Im hi, Re lo, Im lo)
uniform int u_refLen;
uniform int u_refWidth;
uniform vec4 u_refOffset;       // (центр кадра − опорная точка) / S: (x hi, y hi, x lo, y lo)
uniform float u_pixelScaled;    // размер пикселя / S
uniform float u_scale;          // S = 2ᵏ
uniform float u_invScale;       // 1 / S

void refAt(int m, out vec2 zx, out vec2 zy) {
  vec4 t = texelFetch(u_ref, ivec2(m % u_refWidth, m / u_refWidth), 0);
  zx = vec2(t.x, t.z);
  zy = vec2(t.y, t.w);
}

float normInf(vec2 x, vec2 y) {
  return max(abs(x.x), abs(y.x));
}

void main() {
  vec2 o = (gl_FragCoord.xy - 0.5 * u_resolution) * u_pixelScaled;
  o.y *= u_flip;
  vec2 dpx = dfAdd(vec2(u_refOffset.x, u_refOffset.z), vec2(o.x, 0.0));
  vec2 dpy = dfAdd(vec2(u_refOffset.y, u_refOffset.w), vec2(o.y, 0.0));
  ${init}
  vec2 z0x, z0y;
  refAt(0, z0x, z0y);
  vec2 Zx = z0x;
  vec2 Zy = z0y;
  int m = 0;
  for (int i = 0; i < u_maxIter; i++) {
    // (2Z + S·δz') · δz' + δc'
    vec2 ax = dfAdd(2.0 * Zx, u_scale * dzx);
    vec2 ay = dfAdd(2.0 * Zy, u_scale * dzy);
    vec2 nx = dfSub(dfMul(ax, dzx), dfMul(ay, dzy));
    vec2 ny = dfAdd(dfMul(ax, dzy), dfMul(ay, dzx));
    dzx = dfAdd(nx, dcx);
    dzy = dfAdd(ny, dcy);
    m++;
    refAt(m, Zx, Zy);
    vec2 zx = dfAdd(Zx, u_scale * dzx);
    vec2 zy = dfAdd(Zy, u_scale * dzy);
    float r2 = zx.x * zx.x + zy.x * zy.x;
    if (r2 > BAILOUT2) {
      outColor = vec4(escapeColor(smoothIter(float(i), r2)), 1.0);
      return;
    }
    if (normInf(zx, zy) < u_scale * normInf(dzx, dzy) || m >= u_refLen - 1) {
      dzx = u_invScale * dfSub(zx, z0x);
      dzy = u_invScale * dfSub(zy, z0y);
      m = 0;
      Zx = z0x;
      Zy = z0y;
    }
  }
  outColor = vec4(u_inside, 1.0);
}
`;
}

export type PrecisionMode = 'fp32' | 'df64' | 'ptb';

export function fragmentSource(id: FractalId, mode: PrecisionMode): string {
  switch (id) {
    case 'mandelbrot':
    case 'julia':
      if (mode === 'ptb') return perturbSource(id);
      return mode === 'df64' ? escapeDf64(id) : escapeFp32(id);
    case 'burning-ship':
    case 'tricorn':
      return mode === 'df64' ? escapeDf64(id) : escapeFp32(id);
    case 'phoenix':
      return PHOENIX;
    case 'newton':
      return NEWTON;
    case 'lyapunov':
      return LYAPUNOV;
  }
}

/** Растягивает картинку из промежуточной текстуры на весь холст. */
export const BLIT_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
out vec4 outColor;
void main() {
  outColor = texture(u_image, gl_FragCoord.xy / u_resolution);
}
`;
