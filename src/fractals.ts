import { superscript } from './dom';
import { same, tr, type L10n } from './i18n';
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
  name: L10n;
  view: View;
}

export interface FractalDef {
  id: FractalId;
  name: L10n;
  short: L10n;
  /** Короткая подпись для выпадающего списка. */
  tag: L10n;
  formula: L10n;
  overline: L10n;
  blurb: L10n;
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
    name: { ru: 'Множество Мандельброта', en: 'Mandelbrot set' },
    short: { ru: 'Мандельброт', en: 'Mandelbrot' },
    tag: same('z² + c'),
    formula: same('zₙ₊₁ = zₙ² + c,  z₀ = 0'),
    overline: { ru: 'Комплексная плоскость · время убегания', en: 'Complex plane · escape time' },
    blurb: { ru: 'Точки c, для которых орбита нуля остаётся ограниченной.', en: 'Points c for which the orbit of zero stays bounded.' },
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
      { name: { ru: 'Долина морских коньков', en: 'Seahorse Valley' }, view: { cx: -0.7453, cy: 0.1127, span: 0.0065 } },
      { name: { ru: 'Спираль морского конька', en: 'Seahorse spiral' }, view: { cx: -0.743643887037151, cy: 0.13182590420533, span: 0.00012 } },
      { name: { ru: 'Долина слонов', en: 'Elephant Valley' }, view: { cx: 0.2925, cy: 0.0145, span: 0.02 } },
      { name: { ru: 'Миниброт на антенне', en: 'Minibrot on the antenna' }, view: { cx: -1.7685, cy: 0, span: 0.034 } },
      { name: { ru: 'Двойная спираль', en: 'Double spiral' }, view: { cx: -0.7746806106269039, cy: -0.1374168856037867, span: 1.6e-5 } },
      { name: { ru: 'Миниброт на дне спирали', en: 'Minibrot at the bottom of a spiral' }, view: { cx: -0.7746806106269039, cy: -0.1374168856037867, span: 1.2e-11 } },
      { name: { ru: 'Спиральная гряда', en: 'Spiral ridge' }, view: { cx: -0.0886, cy: 0.6546, span: 0.006 } },
      { name: { ru: 'Точка Мисюревича', en: 'Misiurewicz point' }, view: { cx: -0.10109636384562, cy: 0.95628651080914, span: 3e-9 } },
      { name: { ru: 'Остров Жюлиа на антенне', en: 'Julia island on the antenna' }, view: { cx: -1.768778833, cy: -0.001738996, span: 2.5e-7 } },
      { name: { ru: 'Миниброт в долине коньков', en: 'Minibrot in Seahorse Valley' }, view: { cx: -0.743643887037158, cy: 0.131825904205312, span: 4e-10 } },
      { name: { ru: 'Мультиброт', en: 'Multibrot' }, power: 3, view: { cx: 0, cy: 0, span: 2.6 } },
      { name: { ru: 'Дендриты Мультиброта', en: 'Multibrot dendrites' }, power: 3, view: { cx: 0.3605109486626, cy: 0.7083173679287, span: 3e-8 } },
      { name: { ru: 'Мультиброт-пятилистник', en: 'Five-leaf Multibrot' }, power: 6, view: { cx: 0, cy: 0, span: 2.6 } },
    ],
  },
  {
    id: 'julia',
    name: { ru: 'Множество Жюлиа', en: 'Julia set' },
    short: { ru: 'Жюлиа', en: 'Julia' },
    tag: { ru: 'z² + c, c фиксировано', en: 'z² + c, fixed c' },
    formula: { ru: 'zₙ₊₁ = zₙ² + c,  c — константа', en: 'zₙ₊₁ = zₙ² + c,  c is a constant' },
    overline: { ru: 'Комплексная плоскость · параметр c', en: 'Complex plane · parameter c' },
    blurb: { ru: 'Та же формула, но c зафиксировано, а z₀ пробегает плоскость.', en: 'The same formula, but c is fixed and z₀ runs over the plane.' },
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
      { name: { ru: 'Спирали', en: 'Spirals' }, param: [-0.8, 0.156], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Кролик Дуади', en: 'Douady rabbit' }, param: [-0.123, 0.745], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Дендрит', en: 'Dendrite' }, param: [0, 1], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Сан-Марко', en: 'San Marco' }, param: [-0.75, 0], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Диск Зигеля', en: 'Siegel disk' }, param: [-0.390541, -0.586788], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Галактики', en: 'Galaxies' }, param: [-0.7269, 0.1889], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Молнии', en: 'Lightning' }, param: [-0.4, 0.6], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Кружево', en: 'Lace' }, param: [0.285, 0.01], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: { ru: 'Галактики крупным планом', en: 'Galaxies up close' }, param: [-0.7269, 0.1889], view: { cx: 0.0777226063, cy: 0.0979433, span: 2e-6 } },
    ],
  },
  {
    id: 'burning-ship',
    name: { ru: 'Горящий корабль', en: 'Burning Ship' },
    short: same('Burning Ship'),
    tag: same('(|x| + i|y|)² + c'),
    formula: same('zₙ₊₁ = (|Re zₙ| + i·|Im zₙ|)² + c'),
    overline: { ru: 'Комплексная плоскость · время убегания', en: 'Complex plane · escape time' },
    blurb: { ru: 'Мандельброт с модулями: симметрия ломается, появляются «корабли».', en: 'Mandelbrot with absolute values: symmetry breaks and “ships” appear.' },
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
      { name: { ru: 'Корабль', en: 'The ship' }, view: { cx: -1.756, cy: -0.026, span: 0.09 } },
      { name: { ru: 'Такелаж', en: 'Rigging' }, view: { cx: -1.7625, cy: -0.0281, span: 0.008 } },
      { name: { ru: 'Флотилия на горизонте', en: 'Fleet on the horizon' }, view: { cx: -1.5745, cy: -0.008, span: 0.04 } },
      { name: { ru: 'Языки пламени', en: 'Flames' }, view: { cx: -0.4, cy: -0.6, span: 0.7 } },
      { name: { ru: 'Корабль на −1.86', en: 'Ship at −1.86' }, view: { cx: -1.8611, cy: -0.0014, span: 0.0035 } },
      { name: { ru: 'Корабль на −1.94', en: 'Ship at −1.94' }, view: { cx: -1.9411, cy: -0.0024, span: 0.0055 } },
      { name: { ru: 'Шлюпка у горизонта', en: 'Dinghy on the horizon' }, view: { cx: -1.9537112, cy: -0.000032, span: 7e-5 } },
    ],
  },
  {
    id: 'tricorn',
    name: { ru: 'Трикорн', en: 'Tricorn' },
    short: { ru: 'Трикорн', en: 'Tricorn' },
    tag: same('z̄² + c'),
    formula: same('zₙ₊₁ = z̄ₙ² + c,  z₀ = 0'),
    overline: { ru: 'Комплексная плоскость · время убегания', en: 'Complex plane · escape time' },
    blurb: { ru: 'Мандельброт с комплексным сопряжением: вместо кардиоиды — три рога.', en: 'Mandelbrot with complex conjugation: three horns instead of a cardioid.' },
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
      { name: { ru: 'Три рога', en: 'Three horns' }, view: { cx: -0.35, cy: 0, span: 3.2 } },
      { name: { ru: 'Левый рог', en: 'Left horn' }, view: { cx: -1.25, cy: 0, span: 0.5 } },
      { name: { ru: 'Мини-трикорн на антенне', en: 'Mini-tricorn on the antenna' }, view: { cx: -1.764, cy: 0, span: 0.04 } },
      { name: { ru: 'Мультикорн, четыре рога', en: 'Multicorn, four horns' }, power: 3, view: { cx: 0, cy: 0, span: 3.2 } },
      { name: { ru: 'Мультикорн, шесть рогов', en: 'Multicorn, six horns' }, power: 5, view: { cx: 0, cy: 0, span: 3 } },
    ],
  },
  {
    id: 'newton',
    name: { ru: 'Фрактал Ньютона', en: 'Newton fractal' },
    short: { ru: 'Ньютон', en: 'Newton' },
    tag: same('p(z) = 0'),
    formula: same('zₙ₊₁ = zₙ − p(zₙ) / p′(zₙ)'),
    overline: { ru: 'Комплексная плоскость · бассейны корней', en: 'Complex plane · basins of roots' },
    blurb: { ru: 'К какому корню многочлена приведёт метод Ньютона из точки z₀.', en: 'Which root of a polynomial Newton’s method reaches from the point z₀.' },
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
      { name: { ru: 'Три бассейна', en: 'Three basins' }, view: { cx: 0, cy: 0, span: 3 } },
      { name: { ru: 'Бусины на отрицательной оси', en: 'Beads on the negative axis' }, view: { cx: -0.6, cy: 0, span: 0.8 } },
      { name: { ru: 'Окрестность полюса', en: 'Around the pole' }, view: { cx: 0, cy: 0, span: 0.25 } },
      { name: { ru: 'Четыре бассейна', en: 'Four basins' }, poly: 'z4-1', view: { cx: 0, cy: 0, span: 3 } },
      { name: { ru: 'Пять лепестков', en: 'Five petals' }, poly: 'z5-1', view: { cx: 0, cy: 0, span: 3 } },
      { name: { ru: 'Шесть бассейнов', en: 'Six basins' }, poly: 'z6+z3-1', view: { cx: 0, cy: 0, span: 3 } },
      { name: { ru: 'Восемь корней', en: 'Eight roots' }, poly: 'z8+15z4-16', view: { cx: 0, cy: 0, span: 5 } },
      { name: { ru: 'Ловушка цикла 0 ↔ 1', en: 'The 0 ↔ 1 cycle trap' }, poly: 'z3-2z+2', view: { cx: 0, cy: 0, span: 1.2 } },
    ],
  },
  {
    id: 'phoenix',
    name: { ru: 'Фрактал Феникс', en: 'Phoenix fractal' },
    short: { ru: 'Феникс', en: 'Phoenix' },
    tag: same('z² + p + q·zₙ₋₁'),
    formula: same('zₙ₊₁ = zₙ² + p + q·zₙ₋₁,  z₋₁ = 0'),
    overline: { ru: 'Комплексная плоскость · память о прошлом шаге', en: 'Complex plane · memory of the previous step' },
    blurb: { ru: 'Каждый шаг помнит предыдущую точку орбиты — получается птица-феникс.', en: 'Each step remembers the previous orbit point — and a phoenix appears.' },
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
      { name: { ru: 'Птица', en: 'The bird' }, param: [0.56667, -0.5], view: { cx: 0, cy: 0, span: 2.2 } },
      { name: { ru: 'Перья крыла', en: 'Wing feathers' }, param: [0.56667, -0.5], view: { cx: 0.5, cy: 0.05, span: 0.6 } },
      { name: { ru: 'Летучая мышь', en: 'Bat' }, param: [0.6, -0.7], view: { cx: 0, cy: 0, span: 2.2 } },
      { name: { ru: 'Крест', en: 'Cross' }, param: [-0.5, 0.75], view: { cx: 0, cy: 0, span: 3 } },
    ],
  },
  {
    id: 'lyapunov',
    name: { ru: 'Фрактал Ляпунова', en: 'Lyapunov fractal' },
    short: { ru: 'Ляпунов', en: 'Lyapunov' },
    tag: { ru: 'последовательность AB', en: 'AB sequence' },
    formula: same('xₙ₊₁ = rₙ·xₙ(1 − xₙ),  rₙ ∈ {a, b}'),
    overline: { ru: 'Плоскость параметров (a, b) · показатель Ляпунова', en: 'Parameter plane (a, b) · Lyapunov exponent' },
    blurb: { ru: 'Устойчивость логистического отображения при чередовании a и b.', en: 'Stability of the logistic map when a and b alternate.' },
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
      { name: { ru: 'Классика AB', en: 'Classic AB' }, sequence: 'AB', view: { cx: 3, cy: 3, span: 2.05 } },
      { name: { ru: 'Город циркония', en: 'Zircon Zity' }, sequence: 'BBBBBBAAAAAA', view: { cx: 2.95, cy: 3.7, span: 0.6 } },
      { name: { ru: 'Ласточкин хвост', en: 'Swallowtail' }, sequence: 'AABAB', view: { cx: 3.4, cy: 3.4, span: 1.2 } },
      { name: { ru: 'Кристалл', en: 'Crystal' }, sequence: 'ABBAB', view: { cx: 3.4, cy: 3.5, span: 1.0 } },
    ],
  },
];

export function findFractal(id: string | null | undefined): FractalDef | undefined {
  return FRACTALS.find((f) => f.id === id);
}

/** Формула в шапке карты с учётом текущей степени или многочлена. */
export function formulaText(def: FractalDef, params: FractalParams): string {
  const formula = tr(def.formula);
  if (def.controls.includes('poly')) return `${formula},  p(z) = ${findPolynomial(params.poly).label}`;
  if (def.controls.includes('power') && params.power !== 2) return formula.replace('²', superscript(params.power));
  return formula;
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
