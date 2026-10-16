/**
 * Цветовые гаммы. Каждая гамма — градиент от «дальнего» фона (точки, быстро
 * убегающие на бесконечность) к границе множества, отдельный цвет для точек
 * самого множества и акцент, которым окрашиваются обводки и элементы UI.
 */
export interface PaletteColors {
  stops: string[];
  inside: string;
  accent: string;
}

export interface Palette extends PaletteColors {
  id: string;
  name: string;
  /** Вариант для тёмной темы, если светлый не смотрится на тёмном фоне. */
  dark?: PaletteColors;
}

export const PALETTES: Palette[] = [
  {
    id: 'ink',
    name: 'Чернила',
    stops: ['#f7f5ee', '#e4dfd2', '#a9a395', '#4a4740', '#151513', '#4a4740', '#cfc9bb'],
    inside: '#151513',
    accent: '#171614',
    dark: {
      stops: ['#121210', '#2a2925', '#6f6b61', '#c9c4b6', '#fbfaf5', '#c9c4b6', '#55524a'],
      inside: '#fbfaf5',
      accent: '#f2efe6',
    },
  },
  {
    id: 'bulletin',
    name: 'Бюллетень',
    stops: ['#f7f5ee', '#f2c4b9', '#dc4a3d', '#5a1a14', '#151a3d', '#2f55e4', '#c3d0fa'],
    inside: '#0e1230',
    accent: '#2f55e4',
    dark: {
      stops: ['#121210', '#3a1712', '#dc4a3d', '#f6d6cd', '#f7f5ee', '#8ea6f5', '#2f55e4'],
      inside: '#0b0e24',
      accent: '#5b7bf0',
    },
  },
  {
    id: 'magma',
    name: 'Магма',
    stops: ['#000004', '#2c115f', '#721f81', '#b73779', '#f1605d', '#feb078', '#fcfdbf'],
    inside: '#000004',
    accent: '#e0466c',
  },
  {
    id: 'viridis',
    name: 'Виридис',
    stops: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
    inside: '#1d0626',
    accent: '#1f9e89',
  },
  {
    id: 'ocean',
    name: 'Океан',
    stops: ['#020b16', '#08304f', '#13659b', '#4aa3d0', '#bfe3ef', '#fdf9ec'],
    inside: '#020b16',
    accent: '#2186c4',
  },
  {
    id: 'sunset',
    name: 'Закат',
    stops: ['#160a26', '#4b1550', '#a01e5c', '#e0484a', '#f99a3e', '#ffe08a', '#fff7dc'],
    inside: '#160a26',
    accent: '#f0633f',
  },
];

export function findPalette(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function resolveColors(palette: Palette, dark: boolean): PaletteColors {
  return dark && palette.dark ? palette.dark : palette;
}

export function gradientCss(colors: PaletteColors): string {
  return `linear-gradient(90deg, ${colors.stops.join(', ')})`;
}

/**
 * Запекает градиент в RGBA-массив ширины `size`. Интерполяция идёт в OKLab —
 * так переходы между цветами получаются перцептивно ровными, без грязных
 * серых середин, которые даёт смешивание в sRGB.
 */
export function bakeGradient(stops: string[], size = 512): Uint8Array {
  const labs = stops.map((hex) => linearToOklab(hexToLinear(hex)));
  const out = new Uint8Array(size * 4);
  const segments = labs.length - 1;
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * segments;
    const k = Math.min(Math.floor(t), segments - 1);
    const f = t - k;
    const a = labs[k]!;
    const b = labs[k + 1]!;
    const lab: Vec3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const rgb = oklabToLinear(lab);
    out[i * 4] = linearToByte(rgb[0]);
    out[i * 4 + 1] = linearToByte(rgb[1]);
    out[i * 4 + 2] = linearToByte(rgb[2]);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Цвет как sRGB-тройка 0..1 — в таком виде он уходит в шейдер. */
export function hexToRgb(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

type Vec3 = [number, number, number];

function hexToLinear(hex: string): Vec3 {
  return hexToRgb(hex).map(srgbToLinear) as Vec3;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToByte(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
