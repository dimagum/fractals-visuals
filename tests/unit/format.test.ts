import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatFixed, formatZoom, minus } from '../../src/dom';
import { exportDimensions } from '../../src/export';
import { FRACTALS, effectiveIterations, findFractal, minSpanFor, parseSequence } from '../../src/fractals';
import { setLang } from '../../src/i18n';
import { formatComplex } from '../../src/locations';
import { fromDecimal, toNumber } from '../../src/precise';

describe('форматирование чисел', () => {
  beforeEach(() => setLang('ru'));
  afterEach(() => setLang('ru'));

  it('ставит типографский минус и не пишет «−0»', () => {
    expect(minus('-1.5')).toBe('−1.5');
    expect(formatFixed(-0.25, 2)).toBe('−0.25');
    expect(formatFixed(-0.0001, 2)).toBe('0.00');
    expect(formatFixed(-0, 0)).toBe('0');
  });

  it('пишет увеличение с разрядами или степенью', () => {
    expect(formatZoom(1)).toBe('×1');
    expect(formatZoom(2.54)).toBe('×2,5');
    expect(formatZoom(21667).replace(/\s/g, ' ')).toBe('×21 667');
    expect(formatZoom(2.2e11)).toBe('×2.2·10¹¹');
  });

  it('в английском интерфейсе — точка и запятая-разделитель разрядов', () => {
    setLang('en');
    expect(formatZoom(2.54)).toBe('×2.5');
    expect(formatZoom(21667)).toBe('×21,667');
  });

  it('пишет комплексное число', () => {
    expect(formatComplex([-0.123, 0.745])).toBe('−0.123 + 0.745i');
    expect(formatComplex([0.285, -0.01])).toBe('0.285 − 0.010i');
  });
});

describe('параметры фракталов', () => {
  it('разбирает последовательность Ляпунова', () => {
    expect(parseSequence('AB')).toEqual([0, 1]);
    expect(parseSequence(' aabab ')).toEqual([0, 0, 1, 0, 1]);
    expect(parseSequence('AAAA')).toBeNull(); // нужны обе буквы
    expect(parseSequence('ABC')).toBeNull();
    expect(parseSequence('AB'.repeat(9))).toBeNull(); // длиннее 16
  });

  it('добавляет итерации с каждой октавой зума и упирается в максимум', () => {
    const def = findFractal('mandelbrot')!;
    const base = def.iterations.base;
    expect(effectiveIterations(def, base, def.home.span)).toBe(base);
    expect(effectiveIterations(def, base, def.home.span / 2)).toBe(base + def.iterations.perOctave);
    expect(effectiveIterations(def, base, 1e-300)).toBe(def.iterations.max);
  });

  it('у каждого фрактала корректные виды и места', () => {
    for (const def of FRACTALS) {
      expect(def.home.span).toBeGreaterThanOrEqual(def.minSpan);
      expect(def.home.span).toBeLessThanOrEqual(def.maxSpan);
      for (const loc of def.locations) {
        const where = `${def.id}: ${loc.name.ru}`;
        expect(loc.view.span, where).toBeGreaterThanOrEqual(minSpanFor(def, loc.power ?? 2));
        // Глубже предела double центр обязан быть задан строкой.
        if (loc.view.span < 1e-13) expect(loc.precise, where).toBeDefined();
        if (loc.precise) {
          expect(fromDecimal(loc.precise.x), where).not.toBeNull();
          expect(Math.abs(toNumber(fromDecimal(loc.precise.x)!) - loc.view.cx), where).toBeLessThan(1e-12);
          expect(Math.abs(toNumber(fromDecimal(loc.precise.y)!) - loc.view.cy), where).toBeLessThan(1e-12);
        }
      }
    }
  });
});

describe('exportDimensions', () => {
  it('сохраняет пропорции карты', () => {
    expect(exportDimensions('screen', [1200, 700], 1.7)).toEqual([1200, 700]);
    expect(exportDimensions('fhd', [0, 0], 16 / 9)).toEqual([1920, 1080]);
    expect(exportDimensions('4k', [0, 0], 1)).toEqual([3840, 3840]);
    expect(exportDimensions('4k', [0, 0], 0.5)).toEqual([1920, 3840]);
  });
});
