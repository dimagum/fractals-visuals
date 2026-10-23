import { describe, expect, it } from 'vitest';
import { computeTicks, fitLabels, stepDecimals, type Frame } from '../../src/axes';
import { fromDecimal, pointFromNumbers } from '../../src/precise';

const frame = (over: Partial<Frame> = {}): Frame => ({
  center: pointFromNumbers(0, 0),
  unit: 0.01,
  width: 800,
  height: 500,
  flip: 1,
  ...over,
});

describe('computeTicks', () => {
  it('берёт «круглый» шаг 1/2/5·10ᵏ, одинаковый по обеим осям', () => {
    const { step, x, y } = computeTicks(frame());
    // 0.01 ед/px × 96 px ≈ 0.96 → 1
    expect(step).toBe(1);
    expect(x.map((t) => t.label)).toEqual(['−4', '−3', '−2', '−1', '0', '1', '2', '3', '4']);
    expect(y.map((t) => t.label)).toEqual(['−2', '−1', '0', '1', '2']);
    expect(x.filter((t) => t.zero)).toHaveLength(1);
  });

  it('ставит деления в правильные пиксели и учитывает переворот оси Im', () => {
    const up = computeTicks(frame());
    expect(up.x.find((t) => t.label === '0')!.pos).toBe(400);
    expect(up.y.find((t) => t.label === '1')!.pos).toBe(150); // Im вверх: +1 выше центра

    const down = computeTicks(frame({ flip: -1 }));
    expect(down.y.find((t) => t.label === '1')!.pos).toBe(350); // Im вниз
  });

  it('выбирает шаги 2 и 5', () => {
    expect(computeTicks(frame({ unit: 0.02 })).step).toBe(2);
    expect(computeTicks(frame({ unit: 0.05 })).step).toBe(5);
    expect(computeTicks(frame({ unit: 1e-12 })).step).toBeCloseTo(1e-10, 22);
  });

  it('на глубоком зуме подписывает деления точно, а не округлённым double', () => {
    // Кадр шириной ~4·10⁻²⁸ вокруг точки с 33 знаками после запятой.
    const center = {
      x: fromDecimal('-0.743643887037158704752191506114774')!,
      y: fromDecimal('0.131825904205311970493132056385139')!,
    };
    const { x, step } = computeTicks(frame({ center, unit: 5e-31 }));
    expect(step).toBeCloseTo(5e-29, 40);
    expect(x.length).toBeGreaterThanOrEqual(7);
    // Соседние подписи различаются, и у всех общее начало — сам центр.
    expect(new Set(x.map((t) => t.label)).size).toBe(x.length);
    expect(x.every((t) => t.label.startsWith('−0.74364388703715870475219150'))).toBe(true);
    // Деления идут ровно через step/unit = 100 px.
    expect(x[1]!.pos - x[0]!.pos).toBeCloseTo(100, 6);
  });
});

describe('stepDecimals', () => {
  it('даёт столько знаков, сколько нужно шагу', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.02)).toBe(2);
    expect(stepDecimals(1e-11)).toBe(11);
  });
});

describe('fitLabels', () => {
  it('не трогает подписи, которые влезают', () => {
    expect(fitLabels(['0.1', '0.2'], 6)).toEqual(['0.1', '0.2']);
  });

  it('срезает общий префикс и ставит многоточие', () => {
    const labels = ['−0.7436438870', '−0.7436438875', '−0.7436438880'];
    const fitted = fitLabels(labels, 6);
    expect(fitted.every((l) => l.startsWith('…'))).toBe(true);
    expect(fitted.every((l) => l.length <= 6)).toBe(true);
    expect(fitted[0]).toBe('…38870');
  });
});
