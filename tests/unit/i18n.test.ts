import { describe, expect, it } from 'vitest';
import { FRACTALS } from '../../src/fractals';
import { UI_KEYS, uiText, type L10n } from '../../src/i18n';
import { PALETTES } from '../../src/palettes';

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

function expectComplete(text: L10n, where: string): void {
  expect(text.ru.trim(), `${where} (ru)`).not.toBe('');
  expect(text.en.trim(), `${where} (en)`).not.toBe('');
  // В английском тексте не должно остаться кириллицы.
  expect(text.en, `${where} (en)`).not.toMatch(/[А-Яа-яЁё]/);
}

describe('перевод', () => {
  it('у каждой строки интерфейса есть оба языка и одинаковые подстановки', () => {
    for (const key of UI_KEYS) {
      const text = uiText(key);
      expectComplete(text, key);
      expect(placeholders(text.en), key).toEqual(placeholders(text.ru));
    }
  });

  it('у каждого фрактала и места есть английский вариант', () => {
    for (const def of FRACTALS) {
      for (const field of ['name', 'short', 'tag', 'formula', 'overline', 'blurb'] as const) {
        expectComplete(def[field], `${def.id}.${field}`);
      }
      for (const loc of def.locations) expectComplete(loc.name, `${def.id}: ${loc.name.ru}`);
    }
  });

  it('у гамм есть английские названия', () => {
    for (const palette of PALETTES) expectComplete(palette.name, palette.id);
  });
});
