import type { FractalDef, FractalParams } from './fractals';
import { findPolynomial, findRoots, type Complex } from './polynomial';

/**
 * Пошаговые орбиты для разборов «Как это строится». Это те же итерации, что в
 * шейдерах, но на JavaScript и с записью каждого шага — чтобы показать
 * таблицу «n → zₙ» на конкретном числе. Для таблиц используется классический
 * критерий |z| > 2, а не большой радиус шейдера: так нагляднее.
 */

export const ESCAPE_RADIUS = 2;
/** Радиус выхода в шейдере: большой, чтобы сглаживание ν было точным. */
const SHADER_BAILOUT = 256;
/** Сколько шагов считать, прежде чем объявить точку «внутренней». */
export const CONFIRM_STEPS = 1000;

export interface EscapeStep {
  n: number;
  z: Complex;
  abs: number;
}

export interface EscapeOrbit {
  kind: 'escape';
  /** z₀ и c (или p, q у Феникса) — что подставлялось в формулу. */
  z0: Complex;
  c: Complex;
  steps: EscapeStep[];
  /** Номер шага, на котором |zₙ| > 2, или null, если не вышла за CONFIRM_STEPS. */
  escapedAt: number | null;
  /**
   * Сглаженное число итераций ν, как в шейдере: орбита досчитывается до
   * |z| > 256, и ν = n + 1 − log_d ln|zₙ|.
   */
  nu: number | null;
}

export interface NewtonStep {
  n: number;
  z: Complex;
  root: number;
  distance: number;
}

export interface NewtonOrbit {
  kind: 'newton';
  z0: Complex;
  roots: Complex[];
  steps: NewtonStep[];
  /** Индекс корня и шаг сходимости, или null. */
  converged: { root: number; at: number } | null;
  /** Шаг, на котором p′(zₙ) = 0 и шаг Ньютона не определён (шейдер тут останавливается). */
  stalledAt: number | null;
}

export interface LyapunovStep {
  n: number;
  letter: 'A' | 'B';
  r: number;
  x: number;
  term: number;
}

export interface LyapunovOrbit {
  kind: 'lyapunov';
  ab: [number, number];
  warmup: number;
  steps: LyapunovStep[];
  /** Показатель по всем N шагам — как в шейдере. */
  lambda: number;
  total: number;
}

export type Orbit = EscapeOrbit | NewtonOrbit | LyapunovOrbit;

const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const abs = (a: Complex): number => Math.hypot(a[0], a[1]);

export function cpow(z: Complex, d: number): Complex {
  let r = z;
  for (let k = 1; k < d; k++) r = mul(r, z);
  return r;
}

/** Один шаг каждого фрактала времени убегания. */
function escapeStep(id: FractalDef['id'], z: Complex, prev: Complex, c: Complex, power: number): Complex {
  switch (id) {
    case 'burning-ship':
      return add(cpow([Math.abs(z[0]), Math.abs(z[1])], 2), c);
    case 'tricorn':
      return add(cpow([z[0], -z[1]], power), c);
    case 'phoenix':
      // c = (p, q): z² + p + q·z_{n−1}
      return add(add(cpow(z, 2), [c[0], 0]), [c[1] * prev[0], c[1] * prev[1]]);
    default:
      return add(cpow(z, power), c);
  }
}

/**
 * Орбита для точки `point`: у Мандельброта, Burning Ship и Трикорна это c, у
 * Жюлиа и Феникса — z₀ (параметры берутся из params).
 */
export function escapeOrbit(
  def: FractalDef,
  point: Complex,
  params: FractalParams,
  maxRows: number,
): EscapeOrbit {
  const startsAtPoint = def.id === 'julia' || def.id === 'phoenix';
  const power = def.controls.includes('power') ? params.power : 2;
  const c: Complex = startsAtPoint ? params.param : point;
  let z: Complex = startsAtPoint ? point : [0, 0];
  let prev: Complex = [0, 0];
  const steps: EscapeStep[] = [{ n: 0, z, abs: abs(z) }];
  let escapedAt: number | null = abs(z) > ESCAPE_RADIUS ? 0 : null;
  let n = 0;
  for (n = 1; n <= CONFIRM_STEPS && escapedAt === null; n++) {
    const next = escapeStep(def.id, z, prev, c, power);
    prev = z;
    z = next;
    const a = abs(z);
    if (steps.length < maxRows || a > ESCAPE_RADIUS) steps.push({ n, z, abs: a });
    if (a > ESCAPE_RADIUS) escapedAt = n;
  }
  let nu: number | null = null;
  if (escapedAt !== null) {
    // Шейдер выходит при |z| > 256 (а не 2) — досчитываем до того же радиуса.
    let m = escapedAt;
    while (abs(z) <= SHADER_BAILOUT && m < escapedAt + 64) {
      const next = escapeStep(def.id, z, prev, c, power);
      prev = z;
      z = next;
      m++;
    }
    // Шейдер на шаге i получает z_{i+1}, т. е. smoothIter(i = m − 1) = m − log_d ln|z_m|.
    nu = m - Math.log2(Math.log(abs(z))) / Math.log2(power);
  }
  return { kind: 'escape', z0: startsAtPoint ? point : [0, 0], c, steps, escapedAt, nu };
}

export const NEWTON_TOLERANCE = 1e-5;

export function newtonOrbit(z0: Complex, polyId: string, maxRows: number): NewtonOrbit {
  const { coeffs } = findPolynomial(polyId);
  const roots = findRoots(coeffs);
  const nearest = (z: Complex): { root: number; distance: number } =>
    roots.reduce(
      (best, r, i) => {
        const d = abs([z[0] - r[0], z[1] - r[1]]);
        return d < best.distance ? { root: i, distance: d } : best;
      },
      { root: 0, distance: Infinity },
    );
  let z = z0;
  const steps: NewtonStep[] = [{ n: 0, z, ...nearest(z) }];
  let converged: NewtonOrbit['converged'] = null;
  let stalledAt: number | null = null;
  for (let n = 1; n <= CONFIRM_STEPS && !converged; n++) {
    // Схема Горнера, как в шейдере: p и p′ за один проход.
    let p: Complex = [coeffs[coeffs.length - 1]!, 0];
    let dp: Complex = [0, 0];
    for (let k = coeffs.length - 2; k >= 0; k--) {
      dp = add(mul(dp, z), p);
      p = add(mul(p, z), [coeffs[k]!, 0]);
    }
    const den = dp[0] * dp[0] + dp[1] * dp[1];
    if (den < 1e-30) {
      stalledAt = n - 1;
      break;
    }
    const step: Complex = [(p[0] * dp[0] + p[1] * dp[1]) / den, (p[1] * dp[0] - p[0] * dp[1]) / den];
    z = [z[0] - step[0], z[1] - step[1]];
    const near = nearest(z);
    if (steps.length < maxRows || near.distance < NEWTON_TOLERANCE) steps.push({ n, z, ...near });
    if (near.distance < NEWTON_TOLERANCE) converged = { root: near.root, at: n };
  }
  return { kind: 'newton', z0, roots, steps, converged, stalledAt };
}

export function lyapunovOrbit(ab: [number, number], sequence: string, total: number, maxRows: number): LyapunovOrbit {
  const letters = [...sequence] as ('A' | 'B')[];
  const warmup = Math.min(Math.floor(total / 4), 300);
  let x = 0.5;
  let idx = 0;
  const rOf = (letter: 'A' | 'B'): number => (letter === 'A' ? ab[0] : ab[1]);
  for (let i = 0; i < warmup; i++) {
    x = rOf(letters[idx]!) * x * (1 - x);
    idx = (idx + 1) % letters.length;
  }
  const steps: LyapunovStep[] = [];
  let sum = 0;
  for (let i = 0; i < total; i++) {
    const letter = letters[idx]!;
    const r = rOf(letter);
    const term = Math.log(Math.max(Math.abs(r * (1 - 2 * x)), 1e-30));
    if (steps.length < maxRows) steps.push({ n: warmup + i, letter, r, x, term });
    sum += term;
    x = r * x * (1 - x);
    idx = (idx + 1) % letters.length;
  }
  return { kind: 'lyapunov', ab, warmup, steps, lambda: sum / total, total };
}
