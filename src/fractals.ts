/**
 * Описания фракталов: всё, что нужно интерфейсу и рендереру, кроме самих
 * шейдеров (они в shaders.ts). Координаты вида — в «родных» координатах
 * фрактала: комплексная плоскость для первых четырёх, плоскость параметров
 * (a, b) логистического отображения для фрактала Ляпунова.
 */
export type FractalId = 'mandelbrot' | 'julia' | 'burning-ship' | 'newton' | 'lyapunov';

export interface View {
  cx: number;
  cy: number;
  /** Высота видимой области в единицах плоскости. */
  span: number;
}

export interface Location {
  name: string;
  view: View;
  /** Параметр c для множества Жюлиа. */
  julia?: [number, number];
  /** Последовательность A/B для фрактала Ляпунова. */
  sequence?: string;
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
  defaultJulia?: [number, number];
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
    locations: [
      { name: 'Долина морских коньков', view: { cx: -0.7453, cy: 0.1127, span: 0.0065 } },
      { name: 'Спираль морского конька', view: { cx: -0.743643887037151, cy: 0.13182590420533, span: 0.00012 } },
      { name: 'Долина слонов', view: { cx: 0.2925, cy: 0.0145, span: 0.02 } },
      { name: 'Миниброт на антенне', view: { cx: -1.7685, cy: 0, span: 0.034 } },
      { name: 'Двойная спираль', view: { cx: -0.7746806106269039, cy: -0.1374168856037867, span: 1.6e-5 } },
      { name: 'Миниброт на дне спирали', view: { cx: -0.7746806106269039, cy: -0.1374168856037867, span: 1.2e-11 } },
      { name: 'Спиральная гряда', view: { cx: -0.0886, cy: 0.6546, span: 0.006 } },
      { name: 'Точка Мисюревича', view: { cx: -0.10109636384562, cy: 0.95628651080914, span: 3e-9 } },
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
    defaultJulia: [-0.8, 0.156],
    locations: [
      { name: 'Спирали', julia: [-0.8, 0.156], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Кролик Дуади', julia: [-0.123, 0.745], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Дендрит', julia: [0, 1], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Сан-Марко', julia: [-0.75, 0], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Диск Зигеля', julia: [-0.390541, -0.586788], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Галактики', julia: [-0.7269, 0.1889], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Молнии', julia: [-0.4, 0.6], view: { cx: 0, cy: 0, span: 2.4 } },
      { name: 'Кружево', julia: [0.285, 0.01], view: { cx: 0, cy: 0, span: 2.4 } },
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
    locations: [
      { name: 'Корабль', view: { cx: -1.756, cy: -0.026, span: 0.09 } },
      { name: 'Такелаж', view: { cx: -1.7625, cy: -0.0281, span: 0.008 } },
      { name: 'Флотилия на горизонте', view: { cx: -1.5745, cy: -0.008, span: 0.04 } },
      { name: 'Языки пламени', view: { cx: -0.4, cy: -0.6, span: 0.7 } },
    ],
  },
  {
    id: 'newton',
    name: 'Фрактал Ньютона',
    short: 'Ньютон',
    tag: 'z³ − 1 = 0',
    formula: 'zₙ₊₁ = zₙ − (zₙ³ − 1) / 3zₙ²',
    overline: 'Комплексная плоскость · бассейны корней',
    blurb: 'К какому из трёх корней z³ = 1 приведёт метод Ньютона из точки z₀.',
    axes: ['Re', 'Im'],
    home: { cx: 0, cy: 0, span: 3 },
    preview: { cx: -0.35, cy: 0, span: 2.2 },
    iterations: { base: 60, min: 10, max: 400, perOctave: 4 },
    colorScale: 1,
    minSpan: 2e-4,
    maxSpan: 12,
    deep: false,
    locations: [
      { name: 'Три бассейна', view: { cx: 0, cy: 0, span: 3 } },
      { name: 'Бусины на отрицательной оси', view: { cx: -0.6, cy: 0, span: 0.8 } },
      { name: 'Окрестность полюса', view: { cx: 0, cy: 0, span: 0.25 } },
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
