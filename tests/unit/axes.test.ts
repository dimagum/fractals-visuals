import { describe, expect, it } from 'vitest';
import { computeTicks, fitLabels, stepDecimals, type Frame } from '../../src/axes';

const frame = (over: Partial<Frame> = {}): Frame => ({
  cx: 0,
  cy: 0,
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
    expect(x.map((t) => t.value)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    expect(y.map((t) => t.value)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('ставит деления в правильные пиксели и учитывает переворот оси Im', () => {
    const up = computeTicks(frame());
    const zeroX = up.x.find((t) => t.value === 0)!;
    const oneY = up.y.find((t) => t.value === 1)!;
    expect(zeroX.pos).toBe(400);
    expect(oneY.pos).toBe(150); // Im вверх: +1 выше центра

    const down = computeTicks(frame({ flip: -1 }));
    expect(down.y.find((t) => t.value === 1)!.pos).toBe(350); // Im вниз
  });

  it('выбирает шаги 2 и 5', () => {
    expect(computeTicks(frame({ unit: 0.02 })).step).toBe(2);
    expect(computeTicks(frame({ unit: 0.05 })).step).toBe(5);
    expect(computeTicks(frame({ unit: 1e-12 })).step).toBeCloseTo(1e-10, 22);
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
