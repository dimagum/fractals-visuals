import { superscript } from './dom';
import { NEWTON_POLYNOMIALS, findPolynomial } from './polynomial';

/**
 * Описания фракталов: всё, что нужно интерфейсу и рендереру, кроме самих
 * шейдеров (они в shaders.ts). Координаты вида — в «родных» координатах
 * фрактала: комплексная плоскость для всех, кроме фрактала Ляпунова, у
 * которого это плоскость параметров (a, b) логистического отображения.
 */
export type FractalId = 'mandelbrot' | 'julia' | 'burning-ship' | 'tricorn' | 'newton' | 'phoenix' | 'lyapunov';

/**
 * Какие ручки есть у фрактала: степень d, параметр c Жюлиа (мини-карта),
 * параметры p и q Феникса, многочлен Ньютона, последовательность Ляпунова.
 */
export type Control = 'power' | 'julia' | 'phoenix' | 'poly' | 'sequence';

/** Значения всех ручек; фракталу нужны только свои. */
export interface FractalParams {
  power: number;
  /** c для Жюлиа или (p, q) для Феникса. */
  param: [number, number];
  sequence: string;
  poly: string;
}

export const POWER_RANGE: [number, number] = [2, 8];

export interface View {
  cx: number;
  cy: number;
  /** Высота видимой области в единицах плоскости. */
  span: number;
}

export interface Location extends Partial<FractalParams> {
  name: string;
  view: View;
}

export interface FractalDef {
  id: FractalId;
  name: string;
  short: string;
  /** Короткая подпись для выпадающего списка. */
  tag: string;
  formula: string;
  overline: string;
  blurb: string;
  axes: [string, string];
  home: View;
  preview: View;
  /** Ось Im направлена вниз — так Burning Ship принято рисовать «кораблём вверх». */
  flipY?: boolean;
  iterations: { base: number; min: number; max: number; perOctave: number };
  /** Множитель плотности окраски, подобранный под типичный масштаб ν. */
  colorScale: number;
  minSpan: number;
  maxSpan: number;
  /** Есть вариант шейдера с эмуляцией double (double-float) для глубокого зума. */
  deep: boolean;
  controls: Control[];
  defaultParam?: [number, number];
  defaultSequence?: string;
  locations: Location[];
}

export const FRACTALS: FractalDef[] = [
  {
    id: 'mandelbrot',
    name: 'Множество Мандельброта',
    short: 'Мандельброт',
    tag: 'z² + c',
    formula: 'zₙ₊₁ = zₙ² + c,  z₀ = 0',
    overline: 'Комплексная плоскость · время убегания',
    blurb: 'Точки c, для которых орбита нуля остаётся ограниченной.',
    axes: ['Re', 'Im'],
    home: { cx: -0.6, cy: 0, span: 2.6 },
    preview: { cx: -0.72, cy: 0, span: 2.75 },
    iterations: { base: 200, min: 50, max: 5000, perOctave: 40 },
    colorScale: 1,
    minSpan: 1e-11,
    maxSpan: 8,
    deep: true,
    controls: ['power'],
    locations: [
      { name: 'Долина морских коньков', view: { cx: -0.7453, cy: 0.1127, span: 0.0065 } },
      { name: 'Спираль морского конька', view: { cx: -0.743643887037151, cy: 0.13182590420533, span: 0.00012 } },
      { name: 'Долина слонов', view: { cx: 0.2925, cy: 0.0145, span: 0.02 } },
      { name: 'Миниброт на антенне', view: { cx: -1.7685, cy: 0, span: 0.034 } },
      { name: 'Двойная спираль', view: { cx: -0.7746806106269039, cy: -0.1374168856037867, span: 1.6e-5 } },
      { name: 'Миниброт на дне спирали', view: { cx: -0.7746806106269039, cy: -0.1374168856037867, span: 1.2e-11 } },
      { name: 'Спиральная гряда', view: { cx: -0.0886, cy: 0.6546, span: 0.006 } },
      { name: 'Точка Мисюревича', view: { cx: -0.10109636384562, cy: 0.95628651080914, span: 3e-9 } },
      { name: 'Остров Жюлиа на антенне', view: { cx: -1.768778833, cy: -0.001738996, span: 2.5e-7 } },
      { name: 'Миниброт в долине коньков', view: { cx: -0.743643887037158, cy: 0.131825904205312, span: 4e-10 } },
      { name: 'Мультиброт', power: 3, view: { cx: 0, cy: 0, span: 2.6 } },
      { name: 'Дендриты Мультиброта', power: 3, view: { cx: 0.3605109486626, cy: 0.7083173679287, span: 3e-8 } },
      { name: 'Мультиброт-пятилистник', power: 6, view: { cx: 0, cy: 0, span: 2.6 } },
    ],
  },
  {
    id: 'julia',
    name: 'Множество Жюлиа',
    short: 'Жюлиа',
    tag: 'z² + c, c фиксировано',
    formula: 'zₙ₊₁ = zₙ² + c,  c — константа',
    overline: 'Комплексная плоскость · параметр c',
    blurb: 'Та же формула, но c зафиксировано, а z₀ пробегает плоскость.',
    axes: ['Re', 'Im'],
    home: { cx: 0, cy: 0, span: 2.4 },
    preview: { cx: 0, cy: 0, span: 2.9 },
    iterations: { base: 250, min: 50, max: 5000, perOctave: 40 },
    colorScale: 1,
    minSpan: 1e-11,
    maxSpan: 8,
    deep: true,
    controls: ['julia', 'power'],
    defaultParam: [-0.8, 0.156],
    locations: [
      { name: 'Спирали', param: [-0.8, 0.156], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Кролик Дуади', param: [-0.123, 0.745], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Дендрит', param: [0, 1], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Сан-Марко', param: [-0.75, 0], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Диск Зигеля', param: [-0.390541, -0.586788], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Галактики', param: [-0.7269, 0.1889], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Молнии', param: [-0.4, 0.6], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Кружево', param: [0.285, 0.01], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Галактики крупным планом', param: [-0.7269, 0.1889], view: { cx: 0.0777226063, cy: 0.0979433, span: 2e-6 } },
    ],
  },
  {
    id: 'burning-ship',
    name: 'Горящий корабль',
    short: 'Burning Ship',
    tag: '(|x| + i|y|)² + c',
    formula: 'zₙ₊₁ = (|Re zₙ| + i·|Im zₙ|)² + c',
    overline: 'Комплексная плоскость · время убегания',
    blurb: 'Мандельброт с модулями: симметрия ломается, появляются «корабли».',
    axes: ['Re', 'Im'],
    home: { cx: -0.4, cy: -0.55, span: 2.4 },
    preview: { cx: -1.757, cy: -0.034, span: 0.085 },
    flipY: true,
    iterations: { base: 200, min: 50, max: 5000, perOctave: 40 },
    colorScale: 1,
    minSpan: 1e-11,
    maxSpan: 8,
    deep: true,
    controls: [],
    locations: [
      { name: 'Корабль', view: { cx: -1.756, cy: -0.026, span: 0.09 } },
      { name: 'Такелаж', view: { cx: -1.7625, cy: -0.0281, span: 0.008 } },
      { name: 'Флотилия на горизонте', view: { cx: -1.5745, cy: -0.008, span: 0.04 } },
      { name: 'Языки пламени', view: { cx: -0.4, cy: -0.6, span: 0.7 } },
      { name: 'Корабль на −1.86', view: { cx: -1.8611, cy: -0.0014, span: 0.0035 } },
      { name: 'Корабль на −1.94', view: { cx: -1.9411, cy: -0.0024, span: 0.0055 } },
      { name: 'Шлюпка у горизонта', view: { cx: -1.9537112, cy: -0.000032, span: 7e-5 } },
    ],
  },
  {
    id: 'tricorn',
    name: 'Трикорн',
    short: 'Трикорн',
    tag: 'z̄² + c',
    formula: 'zₙ₊₁ = z̄ₙ² + c,  z₀ = 0',
    overline: 'Комплексная плоскость · время убегания',
    blurb: 'Мандельброт с комплексным сопряжением: вместо кардиоиды — три рога.',
    axes: ['Re', 'Im'],
    home: { cx: -0.35, cy: 0, span: 3.2 },
    preview: { cx: -0.35, cy: 0, span: 3.3 },
    iterations: { base: 200, min: 50, max: 5000, perOctave: 40 },
    colorScale: 1,
    minSpan: 1e-11,
    maxSpan: 8,
    deep: true,
    controls: ['power'],
    locations: [
      { name: 'Три рога', view: { cx: -0.35, cy: 0, span: 3.2 } },
      { name: 'Левый рог', view: { cx: -1.25, cy: 0, span: 0.5 } },
      { name: 'Мини-трикорн на антенне', view: { cx: -1.764, cy: 0, span: 0.04 } },
      { name: 'Мультикорн, четыре рога', power: 3, view: { cx: 0, cy: 0, span: 3.2 } },
      { name: 'Мультикорн, шесть рогов', power: 5, view: { cx: 0, cy: 0, span: 3 } },
    ],
  },
  {
    id: 'newton',
    name: 'Фрактал Ньютона',
    short: 'Ньютон',
    tag: 'p(z) = 0',
    formula: 'zₙ₊₁ = zₙ − p(zₙ) / p′(zₙ)',
    overline: 'Комплексная плоскость · бассейны корней',
    blurb: 'К какому корню многочлена приведёт метод Ньютона из точки z₀.',
    axes: ['Re', 'Im'],
    home: { cx: 0, cy: 0, span: 3 },
    preview: { cx: -0.35, cy: 0, span: 2.2 },
    iterations: { base: 60, min: 10, max: 400, perOctave: 4 },
    colorScale: 1,
    minSpan: 2e-4,
    maxSpan: 12,
    deep: false,
    controls: ['poly'],
    locations: [
      { name: 'Три бассейна', view: { cx: 0, cy: 0, span: 3 } },
      { name: 'Бусины на отрицательной оси', view: { cx: -0.6, cy: 0, span: 0.8 } },
      { name: 'Окрестность полюса', view: { cx: 0, cy: 0, span: 0.25 } },
      { name: 'Четыре бассейна', poly: 'z4-1', view: { cx: 0, cy: 0, span: 3 } },
      { name: 'Пять лепестков', poly: 'z5-1', view: { cx: 0, cy: 0, span: 3 } },
      { name: 'Шесть бассейнов', poly: 'z6+z3-1', view: { cx: 0, cy: 0, span: 3 } },
      { name: 'Восемь корней', poly: 'z8+15z4-16', view: { cx: 0, cy: 0, span: 5 } },
      { name: 'Ловушка цикла 0 ↔ 1', poly: 'z3-2z+2', view: { cx: 0, cy: 0, span: 1.2 } },
    ],
  },
  {
    id: 'phoenix',
    name: 'Фрактал Феникс',
    short: 'Феникс',
    tag: 'z² + p + q·zₙ₋₁',
    formula: 'zₙ₊₁ = zₙ² + p + q·zₙ₋₁,  z₋₁ = 0',
    overline: 'Комплексная плоскость · память о прошлом шаге',
    blurb: 'Каждый шаг помнит предыдущую точку орбиты — получается птица-феникс.',
    // Рисуется повёрнутым: по горизонтали Im z₀, по вертикали Re z₀.
    axes: ['Im', 'Re'],
    home: { cx: 0, cy: 0, span: 2.2 },
    preview: { cx: 0, cy: 0, span: 2.6 },
    iterations: { base: 200, min: 50, max: 3000, perOctave: 30 },
    colorScale: 1,
    minSpan: 2e-4,
    maxSpan: 8,
    deep: false,
    controls: ['phoenix'],
    defaultParam: [0.56667, -0.5],
    locations: [
      { name: 'Птица', param: [0.56667, -0.5], view: { cx: 0, cy: 0, span: 2.2 } },
      { name: 'Перья крыла', param: [0.56667, -0.5], view: { cx: 0.5, cy: 0.05, span: 0.6 } },
      { name: 'Летучая мышь', param: [0.6, -0.7], view: { cx: 0, cy: 0, span: 2.2 } },
      { name: 'Крест', param: [-0.5, 0.75], view: { cx: 0, cy: 0, span: 3 } },
    ],
  },
  {
    id: 'lyapunov',
    name: 'Фрактал Ляпунова',
    short: 'Ляпунов',
    tag: 'последовательность AB',
    formula: 'xₙ₊₁ = rₙ·xₙ(1 − xₙ),  rₙ ∈ {a, b}',
    overline: 'Плоскость параметров (a, b) · показатель Ляпунова',
    blurb: 'Устойчивость логистического отображения при чередовании a и b.',
    axes: ['a', 'b'],
    home: { cx: 3.25, cy: 3.3, span: 1.5 },
    preview: { cx: 3.4, cy: 3.45, span: 1.1 },
    iterations: { base: 400, min: 50, max: 4000, perOctave: 40 },
    colorScale: 1,
    minSpan: 1e-3,
    maxSpan: 6,
    deep: false,
    controls: ['sequence'],
    defaultSequence: 'AABAB',
    locations: [
      { name: 'Классика AB', sequence: 'AB', view: { cx: 3, cy: 3, span: 2.05 } },
      { name: 'Город циркония', sequence: 'BBBBBBAAAAAA', view: { cx: 2.95, cy: 3.7, span: 0.6 } },
      { name: 'Ласточкин хвост', sequence: 'AABAB', view: { cx: 3.4, cy: 3.4, span: 1.2 } },
      { name: 'Кристалл', sequence: 'ABBAB', view: { cx: 3.4, cy: 3.5, span: 1.0 } },
    ],
  },
];

export function findFractal(id: string | null | undefined): FractalDef | undefined {
  return FRACTALS.find((f) => f.id === id);
}

/** Формула в шапке карты с учётом текущей степени или многочлена. */
export function formulaText(def: FractalDef, params: FractalParams): string {
  if (def.controls.includes('poly')) return `${def.formula},  p(z) = ${findPolynomial(params.poly).label}`;
  if (def.controls.includes('power') && params.power !== 2) return def.formula.replace('²', superscript(params.power));
  return def.formula;
}

export function defaultParams(def: FractalDef): FractalParams {
  return {
    power: 2,
    param: def.defaultParam ?? [0, 0],
    sequence: def.defaultSequence ?? 'AB',
    poly: NEWTON_POLYNOMIALS[0]!.id,
  };
}

/** Сколько итераций реально считать на данном масштабе. */
export function effectiveIterations(def: FractalDef, base: number, span: number): number {
  const octaves = Math.max(0, Math.log2(def.home.span / span));
  return Math.min(def.iterations.max, Math.round(base + def.iterations.perOctave * octaves));
}

export function parseSequence(text: string): number[] | null {
  const clean = text.trim().toUpperCase();
  if (!/^[AB]{1,16}$/.test(clean) || !clean.includes('A') || !clean.includes('B')) return null;
  return [...clean].map((ch) => (ch === 'A' ? 0 : 1));
}
