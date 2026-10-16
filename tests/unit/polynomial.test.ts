import { describe, expect, it } from 'vitest';
import { MAX_DEGREE, NEWTON_POLYNOMIALS, evaluate, findRoots } from '../../src/polynomial';

const sortRoots = (roots: [number, number][]): [number, number][] =>
  [...roots].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

describe('findRoots', () => {
  it('находит корни z³ − 1', () => {
    const roots = sortRoots(findRoots([-1, 0, 0, 1]));
    const expected = sortRoots([
      [1, 0],
      [-0.5, Math.sqrt(3) / 2],
      [-0.5, -Math.sqrt(3) / 2],
    ]);
    roots.forEach((r, i) => {
      expect(r[0]).toBeCloseTo(expected[i]![0], 12);
      expect(r[1]).toBeCloseTo(expected[i]![1], 12);
    });
  });

  it('находит корень в нуле и чисто мнимые корни z⁵ − z', () => {
    const roots = sortRoots(findRoots([0, -1, 0, 0, 0, 1]));
    expect(roots).toContainEqual([0, 0]);
    expect(roots.some(([re, im]) => re === 0 && Math.abs(im - 1) < 1e-12)).toBe(true);
  });

  it('для каждого многочлена в списке корни действительно обнуляют его', () => {
    for (const poly of NEWTON_POLYNOMIALS) {
      const degree = poly.coeffs.length - 1;
      expect(degree).toBeLessThanOrEqual(MAX_DEGREE);
      const roots = findRoots(poly.coeffs);
      expect(roots).toHaveLength(degree);
      for (const root of roots) {
        const [re, im] = evaluate(poly.coeffs, root);
        expect(Math.hypot(re, im), `${poly.label} в ${root}`).toBeLessThan(1e-9);
      }
    }
  });
});
