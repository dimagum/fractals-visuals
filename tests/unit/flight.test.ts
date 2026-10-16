import { describe, expect, it } from 'vitest';
import { easeInOutCubic, flightPath } from '../../src/flight';

describe('flightPath', () => {
  it('начинается в исходном виде и заканчивается в целевом', () => {
    const from = { cx: -0.6, cy: 0, span: 2.6 };
    const to = { cx: -0.7453, cy: 0.1127, span: 0.0065 };
    const path = flightPath(from, to);
    const start = path.at(0);
    const end = path.at(1);
    expect(start.cx).toBeCloseTo(from.cx, 12);
    expect(start.cy).toBeCloseTo(from.cy, 12);
    expect(start.span).toBeCloseTo(from.span, 12);
    expect(end.cx).toBeCloseTo(to.cx, 9);
    expect(end.cy).toBeCloseTo(to.cy, 9);
    expect(end.span / to.span).toBeCloseTo(1, 6);
    expect(path.length).toBeGreaterThan(0);
  });

  it('при далёком перелёте сначала отдаляется', () => {
    const from = { cx: -1.75, cy: 0, span: 1e-3 };
    const to = { cx: 0.28, cy: 0.01, span: 1e-3 };
    const path = flightPath(from, to);
    expect(path.at(0.5).span).toBeGreaterThan(1);
  });

  it('остаётся численно устойчивым на глубоком зуме', () => {
    const from = { cx: -0.6, cy: 0, span: 2.6 };
    const to = { cx: -0.7746806106269039, cy: -0.1374168856037867, span: 1.2e-11 };
    const path = flightPath(from, to);
    for (let t = 0; t <= 1; t += 0.05) {
      const v = path.at(t);
      expect(Number.isFinite(v.cx) && Number.isFinite(v.cy) && Number.isFinite(v.span)).toBe(true);
      expect(v.span).toBeGreaterThan(0);
    }
    const end = path.at(1);
    expect(Math.abs(end.cx - to.cx) / to.span).toBeLessThan(0.01);
    expect(Math.abs(end.cy - to.cy) / to.span).toBeLessThan(0.01);
  });

  it('чистый зум без сдвига', () => {
    const path = flightPath({ cx: 1, cy: 1, span: 1 }, { cx: 1, cy: 1, span: 0.01 });
    expect(path.at(0.5).cx).toBe(1);
    expect(path.at(0.5).span).toBeCloseTo(0.1, 10); // геометрическая середина
  });
});

describe('easeInOutCubic', () => {
  it('сохраняет концы и середину', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
});
