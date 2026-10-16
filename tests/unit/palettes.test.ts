import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUSTOM,
  MAX_STOPS,
  PALETTES,
  bakeGradient,
  decodeCustom,
  encodeCustom,
  findPalette,
  hexToRgb,
  resolveColors,
} from '../../src/palettes';

const pixel = (data: Uint8Array, i: number): [number, number, number] => [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];

describe('bakeGradient', () => {
  it('начинается и заканчивается ровно цветами крайних опорных точек', () => {
    const data = bakeGradient(['#000000', '#ff0000', '#ffffff'], 64);
    expect(pixel(data, 0)).toEqual([0, 0, 0]);
    expect(pixel(data, 63)).toEqual([255, 255, 255]);
    expect(data[3]).toBe(255);
  });

  it('проходит через промежуточную опорную точку', () => {
    const data = bakeGradient(['#000000', '#2f55e4', '#ffffff'], 65);
    const [r, g, b] = pixel(data, 32);
    expect(Math.abs(r - 0x2f)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 0x55)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 0xe4)).toBeLessThanOrEqual(1);
  });
});

describe('палитры', () => {
  it('разбирают hex', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
  });

  it('у всех гамм валидные цвета', () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const p of PALETTES) {
      for (const colors of [p, p.dark].filter(Boolean)) {
        expect(colors!.stops.length).toBeGreaterThanOrEqual(2);
        expect(colors!.stops.every((s) => hex.test(s))).toBe(true);
        expect(hex.test(colors!.inside) && hex.test(colors!.accent)).toBe(true);
      }
    }
  });

  it('берут тёмный вариант только если он есть', () => {
    const ink = findPalette('ink');
    const magma = findPalette('magma');
    expect(resolveColors(ink, true)).toBe(ink.dark);
    expect(resolveColors(magma, true)).toBe(magma);
    expect(findPalette('nope')).toBe(PALETTES[0]);
  });
});

describe('своя гамма в адресе', () => {
  it('кодируется и раскодируется без потерь', () => {
    const encoded = encodeCustom(DEFAULT_CUSTOM);
    expect(encoded).toBe('0b1d2a-1f6f8b-99d5c9-f6f1d1-e86a33_0b1d2a_1f6f8b');
    expect(decodeCustom(encoded)).toEqual(DEFAULT_CUSTOM);
  });

  it('приводит hex к нижнему регистру', () => {
    expect(decodeCustom('FFFFFF-000000_ABCDEF_123456')).toEqual({
      stops: ['#ffffff', '#000000'],
      inside: '#abcdef',
      accent: '#123456',
    });
  });

  it('отвергает испорченные строки', () => {
    expect(decodeCustom('')).toBeNull();
    expect(decodeCustom('ffffff_000000_111111')).toBeNull(); // один опорный цвет
    expect(decodeCustom('ffffff-zzzzzz_000000_111111')).toBeNull();
    expect(decodeCustom(`${Array(MAX_STOPS + 1).fill('ffffff').join('-')}_000000_111111`)).toBeNull();
    expect(decodeCustom('ffffff-000000_000000')).toBeNull();
  });
});
