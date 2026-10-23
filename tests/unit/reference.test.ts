import { describe, expect, it } from 'vitest';
import { fromDecimal, pointFromNumbers } from '../../src/precise';
import { bitsFor, computeReference } from '../../src/reference';

const zero = pointFromNumbers(0, 0);

describe('computeReference', () => {
  it('совпадает с обычной итерацией в double на первых шагах', () => {
    const orbit = computeReference({ kind: 'mandelbrot', center: pointFromNumbers(-0.5, 0.5), param: zero, maxIter: 40, bits: 128 });
    let x = 0;
    let y = 0;
    for (let n = 0; n < 40; n++) {
      expect(orbit.data[2 * n]).toBeCloseTo(x, 5);
      expect(orbit.data[2 * n + 1]).toBeCloseTo(y, 5);
      [x, y] = [x * x - y * y - 0.5, 2 * x * y + 0.5];
    }
    expect(orbit.escaped).toBe(false);
    expect(orbit.length).toBe(41);
  });

  it('останавливается, когда опорная точка убегает', () => {
    const orbit = computeReference({ kind: 'mandelbrot', center: pointFromNumbers(0.5, 0.5), param: zero, maxIter: 100, bits: 96 });
    expect(orbit.escaped).toBe(true);
    expect(orbit.length).toBeLessThan(20);
  });

  it('у Жюлиа стартует из опорной точки и берёт c из параметра', () => {
    const orbit = computeReference({ kind: 'julia', center: pointFromNumbers(1, 1), param: pointFromNumbers(-1, 0), maxIter: 3, bits: 96 });
    expect([orbit.data[0], orbit.data[1]]).toEqual([1, 1]);
    expect([orbit.data[2], orbit.data[3]]).toEqual([-1, 2]); // (1 + i)² − 1
  });

  it('различает точки, неразличимые в double', () => {
    // При c = −1.9 орбита хаотична (показатель Ляпунова > 0): сдвиг в 10⁻²⁸
    // растёт с каждым шагом. В double эти две точки — одно и то же число.
    const a = { x: fromDecimal('-1.9')!, y: fromDecimal('0')! };
    const b = { x: a.x + fromDecimal('1e-28')!, y: a.y };
    const bits = bitsFor(1e-30);
    const oa = computeReference({ kind: 'mandelbrot', center: a, param: zero, maxIter: 3000, bits });
    const ob = computeReference({ kind: 'mandelbrot', center: b, param: zero, maxIter: 3000, bits });
    let maxDiff = 0;
    for (let i = 0; i < Math.min(oa.length, ob.length) * 2; i++) maxDiff = Math.max(maxDiff, Math.abs(oa.data[i]! - ob.data[i]!));
    expect(maxDiff > 1e-3 || oa.length !== ob.length).toBe(true);
  });

  it('укладывается во время на глубоком зуме', () => {
    const t0 = performance.now();
    computeReference({ kind: 'mandelbrot', center: pointFromNumbers(-0.75, 0.1), param: zero, maxIter: 20000, bits: bitsFor(1e-30) });
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('bitsFor', () => {
  it('растёт с глубиной и не опускается ниже 96', () => {
    expect(bitsFor(1)).toBe(96);
    expect(bitsFor(1e-30)).toBeGreaterThan(Math.log2(1e30) + 64);
  });
});
