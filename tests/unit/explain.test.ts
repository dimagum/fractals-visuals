import { describe, expect, it } from 'vitest';
import { EXPLANATIONS } from '../../src/explain';
import { FRACTALS, defaultParams, findFractal, type FractalId } from '../../src/fractals';
import { parseMath } from '../../src/math';
import { escapeOrbit, lyapunovOrbit, newtonOrbit } from '../../src/orbits';

const escapes = (id: FractalId, i: number): number | null => {
  const def = findFractal(id)!;
  return escapeOrbit(def, EXPLANATIONS[id].examples[i]!.point, defaultParams(def), 10).escapedAt;
};

describe('разборы на примерах', () => {
  it('у каждого фрактала есть шаги, формулы и примеры на обоих языках', () => {
    for (const def of FRACTALS) {
      const ex = EXPLANATIONS[def.id];
      expect(ex.steps.length, def.id).toBeGreaterThanOrEqual(4);
      expect(ex.formulas.length, def.id).toBeGreaterThanOrEqual(2);
      expect(ex.examples.length, def.id).toBeGreaterThanOrEqual(2);
      for (const text of [ex.intro, ...ex.steps.flatMap((s) => [s.title, s.text]), ...ex.examples.map((e) => e.label)]) {
        expect(text.ru.trim() && text.en.trim()).toBeTruthy();
        expect(text.en).not.toMatch(/[А-Яа-яЁё]/);
      }
    }
  });

  // Подписи примеров должны говорить правду о том, что покажет таблица.
  it('подписи примеров соответствуют поведению орбит', () => {
    expect(escapes('mandelbrot', 0)).toBeLessThanOrEqual(10); // «быстро убегает»
    expect(escapes('mandelbrot', 1)).toBeNull(); // «внутри множества»
    expect(escapes('mandelbrot', 2)).toBeGreaterThan(10); // долина коньков — медленно
    expect(escapes('julia', 2)).not.toBeNull(); // «далеко от центра»
    expect(escapes('burning-ship', 0)).toBeNull(); // «на корабле»
    expect(escapes('burning-ship', 1)).toBeNull(); // «внутри корпуса»
    expect(escapes('burning-ship', 2)).not.toBeNull(); // «снаружи»
    expect(escapes('tricorn', 0)).toBeNull(); // «внутри»
    expect(escapes('tricorn', 2)).not.toBeNull(); // «снаружи»
    expect(escapes('tricorn', 1)).toBeNull(); // «на роге»
    expect(escapes('phoenix', 1)).toBeNull(); // «на крыле»
    expect(escapes('phoenix', 2)).not.toBeNull(); // «снаружи»

    for (const ex of EXPLANATIONS.newton.examples) {
      expect(newtonOrbit(ex.point, 'z3-1', 10).converged, String(ex.point)).not.toBeNull();
    }

    const lyap = (i: number): number =>
      lyapunovOrbit(EXPLANATIONS.lyapunov.examples[i]!.point as [number, number], 'AABAB', 400, 10).lambda;
    expect(lyap(0)).toBeLessThan(0); // «порядок»
    expect(lyap(2)).toBeGreaterThan(0); // «хаос»
  });
});

describe('parseMath', () => {
  it('разбирает индексы и степени', () => {
    expect(parseMath('z_{n+1} = z_n^2 + c')).toEqual([
      { kind: 'text', text: 'z' },
      { kind: 'sub', text: 'n+1' },
      { kind: 'text', text: ' = z' },
      { kind: 'sub', text: 'n' },
      { kind: 'sup', text: '2' },
      { kind: 'text', text: ' + c' },
    ]);
  });

  it('не трогает текст без разметки и одиночный символ в конце', () => {
    expect(parseMath('|z| = √(x + y)')).toEqual([{ kind: 'text', text: '|z| = √(x + y)' }]);
    expect(parseMath('a^')).toEqual([{ kind: 'text', text: 'a^' }]);
  });
});
