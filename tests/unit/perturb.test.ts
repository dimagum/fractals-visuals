import { describe, expect, it } from 'vitest';
import { isValidFor, type ReferenceQuery } from '../../src/perturb';
import { offsetPoint, pointFromNumbers } from '../../src/precise';
import { bitsFor, computeReference } from '../../src/reference';

const zero = pointFromNumbers(0, 0);
const center = pointFromNumbers(-0.5, 0.5); // внутри множества: опорная орбита не убегает
const orbit = computeReference({ kind: 'mandelbrot', center, param: zero, maxIter: 3000, bits: bitsFor(1e-20) + 40 });

const query = (patch: Partial<ReferenceQuery> = {}): ReferenceQuery => ({
  kind: 'mandelbrot',
  center,
  param: zero,
  span: 1e-20,
  iterations: 2000,
  ...patch,
});

describe('когда пересчитывать опорную орбиту', () => {
  it('подходит для того же кадра', () => {
    expect(isValidFor(orbit, query())).toBe(true);
  });

  it('подходит при небольшом сдвиге, но не при уходе дальше 8 кадров', () => {
    expect(isValidFor(orbit, query({ center: offsetPoint(center, 5e-20, 0) }))).toBe(true);
    expect(isValidFor(orbit, query({ center: offsetPoint(center, 9e-20, 0) }))).toBe(false);
  });

  it('требует новой орбиты, когда не хватает точности или итераций', () => {
    expect(isValidFor(orbit, query({ span: 1e-40 }))).toBe(false);
    expect(isValidFor(orbit, query({ iterations: 5000 }))).toBe(false);
  });

  it('не путает Мандельброт с Жюлиа и разные c', () => {
    expect(isValidFor(orbit, query({ kind: 'julia' }))).toBe(false);
    expect(isValidFor(orbit, query({ param: pointFromNumbers(0.1, 0) }))).toBe(false);
  });

  it('убежавшая опорная орбита годится при любом числе итераций — выручает ребейзинг', () => {
    const escaped = computeReference({ kind: 'mandelbrot', center: pointFromNumbers(0.5, 0.5), param: zero, maxIter: 100, bits: 160 });
    expect(escaped.escaped).toBe(true);
    expect(isValidFor(escaped, query({ center: pointFromNumbers(0.5, 0.5), iterations: 10000 }))).toBe(true);
  });
});
