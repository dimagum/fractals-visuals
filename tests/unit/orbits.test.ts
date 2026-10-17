import { describe, expect, it } from 'vitest';
import { defaultParams, findFractal, type FractalParams } from '../../src/fractals';
import { escapeOrbit, lyapunovOrbit, newtonOrbit } from '../../src/orbits';

const def = (id: string) => findFractal(id)!;
const params = (id: string, patch: Partial<FractalParams> = {}): FractalParams => ({
  ...defaultParams(def(id)),
  ...patch,
});

describe('escapeOrbit', () => {
  it('повторяет ручной расчёт для c = 0.5 + 0.5i и убегает на 5-м шаге', () => {
    const orbit = escapeOrbit(def('mandelbrot'), [0.5, 0.5], params('mandelbrot'), 12);
    const z = orbit.steps.map((s) => s.z);
    expect(z[1]).toEqual([0.5, 0.5]);
    expect(z[2]).toEqual([0.5, 1]);
    expect(z[3]).toEqual([-0.25, 1.5]);
    expect(z[4]![0]).toBeCloseTo(-1.6875, 12);
    expect(z[4]![1]).toBeCloseTo(-0.25, 12);
    expect(orbit.escapedAt).toBe(5);
    expect(orbit.steps.at(-1)!.abs).toBeGreaterThan(2);
  });

  it('не выпускает точки множества', () => {
    expect(escapeOrbit(def('mandelbrot'), [-0.5, 0.5], params('mandelbrot'), 12).escapedAt).toBeNull();
    expect(escapeOrbit(def('mandelbrot'), [-2, 0], params('mandelbrot'), 12).escapedAt).toBeNull();
    // Чуть правее острия кардиоиды точка убегает, но медленно.
    expect(escapeOrbit(def('mandelbrot'), [0.26, 0], params('mandelbrot'), 12).escapedAt).toBeGreaterThan(20);
  });

  it('у Мультиброта возводит в степень d', () => {
    const orbit = escapeOrbit(def('mandelbrot'), [0.5, 0], params('mandelbrot', { power: 3 }), 12);
    expect(orbit.steps[2]!.z[0]).toBeCloseTo(0.5 ** 3 + 0.5, 12);
  });

  it('у Жюлиа стартует из точки, а c берёт из параметра', () => {
    const basilica = params('julia', { param: [-1, 0] });
    expect(escapeOrbit(def('julia'), [0, 0], basilica, 12).escapedAt).toBeNull();
    const orbit = escapeOrbit(def('julia'), [1, 1], basilica, 12);
    expect(orbit.z0).toEqual([1, 1]);
    expect(orbit.c).toEqual([-1, 0]);
    expect(orbit.steps[1]!.z).toEqual([-1, 2]); // (1 + i)² − 1 = 2i − 1
  });

  it('у Burning Ship берёт модули, у Трикорна — сопряжение', () => {
    // z₁ = c, z₂ = (|x| + i|y|)² + c = (0.5 + 0.25i)² + (−0.5 − 0.25i) = −0.3125.
    const ship = escapeOrbit(def('burning-ship'), [-0.5, -0.25], params('burning-ship'), 4).steps[2]!.z;
    expect(ship[0]).toBeCloseTo(-0.3125, 12);
    expect(ship[1]).toBeCloseTo(0, 12);
    // z₂ = (0.5 − 0.25i)² + (0.5 + 0.25i) = 0.6875.
    const tri = escapeOrbit(def('tricorn'), [0.5, 0.25], params('tricorn'), 4).steps[2]!.z;
    expect(tri[0]).toBeCloseTo(0.6875, 12);
    expect(tri[1]).toBeCloseTo(0, 12);
  });

  it('у Феникса учитывает предыдущую точку', () => {
    const orbit = escapeOrbit(def('phoenix'), [0.5, 0], params('phoenix', { param: [0.1, 0.2] }), 6);
    expect(orbit.steps[1]!.z[0]).toBeCloseTo(0.25 + 0.1 + 0.2 * 0, 12);
    expect(orbit.steps[2]!.z[0]).toBeCloseTo(0.35 ** 2 + 0.1 + 0.2 * 0.5, 12);
  });
});

describe('newtonOrbit', () => {
  it('из z₀ = 2 сходится к корню 1 у z³ − 1', () => {
    const orbit = newtonOrbit([2, 0], 'z3-1', 12);
    expect(orbit.roots).toHaveLength(3);
    expect(orbit.converged).not.toBeNull();
    const root = orbit.roots[orbit.converged!.root]!;
    expect(root[0]).toBeCloseTo(1, 9);
    expect(root[1]).toBeCloseTo(0, 9);
    // Первый шаг вручную: 2 − (8 − 1) / 12 = 1.41666…
    expect(orbit.steps[1]!.z[0]).toBeCloseTo(2 - 7 / 12, 12);
  });

  it('в нуле у z³ − 1 производная обнуляется, и метод останавливается', () => {
    const orbit = newtonOrbit([0, 0], 'z3-1', 12);
    expect(orbit.stalledAt).toBe(0);
    expect(orbit.converged).toBeNull();
  });

  it('из нуля у z³ − 2z + 2 попадает в цикл 0 ↔ 1 и не сходится', () => {
    const orbit = newtonOrbit([0, 0], 'z3-2z+2', 12);
    expect(orbit.converged).toBeNull();
    expect(orbit.steps[1]!.z[0]).toBeCloseTo(1, 12);
    expect(orbit.steps[2]!.z[0]).toBeCloseTo(0, 12);
  });
});

describe('lyapunovOrbit', () => {
  it('в устойчивой точке r = 2.5 даёт λ = ln 0.5', () => {
    // Неподвижная точка x* = 0.6, производная r(1 − 2x*) = −0.5.
    expect(lyapunovOrbit([2.5, 2.5], 'AB', 400, 8).lambda).toBeCloseTo(Math.log(0.5), 6);
  });

  it('при r = 3.9 хаос: λ > 0', () => {
    // r = 4 не годится: из x₀ = ½ орбита сразу падает в 0 (½ → 1 → 0), и λ = ln 4.
    expect(lyapunovOrbit([3.9, 3.9], 'AB', 4000, 8).lambda).toBeGreaterThan(0.3);
  });

  it('чередует a и b по последовательности', () => {
    const orbit = lyapunovOrbit([3, 3.5], 'AAB', 400, 6);
    const letters = orbit.steps.map((s) => s.letter).join('');
    expect(['AABAAB', 'ABAABA', 'BAABAA']).toContain(letters);
    expect(orbit.steps.every((s) => s.r === (s.letter === 'A' ? 3 : 3.5))).toBe(true);
  });
});
