import { describe, expect, it } from 'vitest';
import {
  FRAC,
  ONE,
  ceilDiv,
  difference,
  floorDiv,
  fromDecimal,
  fromNumber,
  offsetPoint,
  pointFromNumbers,
  toDecimal,
  toNumber,
} from '../../src/precise';

describe('Fixed: перевод из double и обратно', () => {
  it('переводит double без потерь', () => {
    for (const x of [0, 1, -1, 0.5, 0.1, -0.7436438870371587, 1e-30, -3.5e-60, 123456.789]) {
      expect(toNumber(fromNumber(x))).toBe(x);
    }
    // Мельче шага сетки 2⁻³²⁰ ≈ 5·10⁻⁹⁷ значения не различаются — и не нужно.
    expect(Math.abs(toNumber(fromNumber(-3.5e-200)))).toBeLessThanOrEqual(2 ** -320);
    expect(fromNumber(1)).toBe(ONE);
    expect(fromNumber(-0.5)).toBe(-(ONE >> 1n));
  });

  it('не теряет крошечный сдвиг рядом с большим числом', () => {
    // В double −0.75 + 1e-30 = −0.75; в Fixed сдвиг сохраняется.
    const p = offsetPoint(pointFromNumbers(-0.75, 0.1), 1e-30, -2e-31);
    const [dx, dy] = difference(p, pointFromNumbers(-0.75, 0.1));
    expect(dx).toBeCloseTo(1e-30, 40);
    expect(dy).toBeCloseTo(-2e-31, 40);
  });
});

describe('Fixed: десятичная запись', () => {
  it('разбирает длинные десятичные строки точнее double', () => {
    const a = fromDecimal('-0.743643887037158704752191506114774')!;
    const b = fromDecimal('-0.743643887037158704752191506114775')!;
    expect(toNumber(b - a)).toBeCloseTo(-1e-33, 45);
    expect(toDecimal(a, 33)).toBe('-0.743643887037158704752191506114774');
  });

  it('понимает знак, экспоненту и типографский минус', () => {
    expect(toNumber(fromDecimal('2.6')!)).toBe(2.6);
    expect(toNumber(fromDecimal('−1.5')!)).toBe(-1.5);
    expect(toNumber(fromDecimal('1.2e-11')!)).toBe(1.2e-11);
    expect(toNumber(fromDecimal('+3')!)).toBe(3);
    expect(fromDecimal('abc')).toBeNull();
    expect(fromDecimal('')).toBeNull();
  });

  it('округляет при печати и не пишет «-0»', () => {
    expect(toDecimal(fromNumber(0.125), 2)).toBe('0.13');
    expect(toDecimal(fromNumber(-0.0001), 2)).toBe('0.00');
    expect(toDecimal(fromNumber(-2.5), 0)).toBe('-3');
    expect(toDecimal(fromNumber(42), 3)).toBe('42.000');
  });
});

describe('деление с округлением', () => {
  it('округляет вниз и вверх для любых знаков', () => {
    expect(floorDiv(7n, 2n)).toBe(3n);
    expect(floorDiv(-7n, 2n)).toBe(-4n);
    expect(ceilDiv(7n, 2n)).toBe(4n);
    expect(ceilDiv(-7n, 2n)).toBe(-3n);
    expect(ceilDiv(6n, 2n)).toBe(3n);
    expect(floorDiv(-6n, 2n)).toBe(-3n);
  });

  it('держит 320 знаков после запятой', () => {
    expect(FRAC).toBe(320n);
  });
});
