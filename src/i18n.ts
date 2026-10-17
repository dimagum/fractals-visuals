/**
 * Локализация: русский и английский. Тексты интерфейса — в словаре UI,
 * тексты фракталов и мест лежат рядом с данными как пары { ru, en }.
 * Язык выбирается переключателем в шапке, запоминается в localStorage, а при
 * первом визите берётся из языка браузера.
 */
export type Lang = 'ru' | 'en';
export type L10n = Record<Lang, string>;

export const LANGS: { id: Lang; label: string; name: string }[] = [
  { id: 'ru', label: 'RU', name: 'Русский' },
  { id: 'en', label: 'EN', name: 'English' },
];

const STORAGE_KEY = 'fractals.lang';
const listeners = new Set<() => void>();

let lang: Lang = detect();

function detect(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ru' || stored === 'en') return stored;
  } catch {
    // Хранилище недоступно — решаем по языку браузера.
  }
  if (typeof navigator === 'undefined') return 'ru';
  return (navigator.languages ?? [navigator.language]).some((l) => l?.toLowerCase().startsWith('ru')) ? 'ru' : 'en';
}

export function currentLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Не запомнится между визитами — не страшно.
  }
  applyDocumentLang();
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyDocumentLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
applyDocumentLang();

/** Локаль для toLocaleString: разделители разрядов и дробной части. */
export function locale(): string {
  return lang === 'ru' ? 'ru-RU' : 'en-US';
}

/** Выбирает текст на текущем языке. */
export function tr(text: L10n): string {
  return text[lang];
}

/** Одинаковый текст на обоих языках — для формул и имён собственных. */
export function same(text: string): L10n {
  return { ru: text, en: text };
}

const UI = {
  siteName: { ru: 'Атлас фракталов', en: 'Fractal Atlas' },
  allFractals: { ru: '← Все фракталы', en: '← All fractals' },
  language: { ru: 'Язык', en: 'Language' },
  noWebglTitle: { ru: 'Нужен WebGL2', en: 'WebGL2 required' },
  noWebglText: {
    ru: 'Фракталы считаются на видеокарте через WebGL2, а этот браузер его не поддерживает. Попробуйте свежий Chrome, Firefox или Safari.',
    en: 'Fractals are computed on the GPU via WebGL2, which this browser does not support. Try a recent Chrome, Firefox or Safari.',
  },
  renderFailed: { ru: 'Не удалось нарисовать', en: 'Rendering failed' },

  galleryOverline: { ru: 'Атлас · {count} фракталов', en: 'Atlas · {count} fractals' },
  galleryTitle: { ru: 'Фракталы как карты', en: 'Fractals as maps' },
  galleryLede: {
    ru: 'Самые известные фракталы, построенные по формулам прямо на видеокарте. Выберите плитку — и приближайте, пока хватает точности.',
    en: 'The best-known fractals, computed from their formulas right on your GPU. Pick a tile and zoom in as far as precision allows.',
  },

  palette: { ru: 'Цветовая гамма', en: 'Color palette' },
  paletteAndFractal: { ru: 'Гамма и фрактал', en: 'Palette and fractal' },
  fractal: { ru: 'Фрактал', en: 'Fractal' },
  chooseFractal: { ru: 'Выбрать фрактал', en: 'Choose a fractal' },
  customPalette: { ru: 'Своя гамма', en: 'Custom palette' },
  reset: { ru: 'Сбросить', en: 'Reset' },
  done: { ru: 'Готово', en: 'Done' },
  gradientLabel: { ru: 'Градиент: от фона к границе', en: 'Gradient: from background to boundary' },
  colorN: { ru: 'Цвет {n}', en: 'Color {n}' },
  removeColor: { ru: 'Убрать цвет', en: 'Remove color' },
  removeColorN: { ru: 'Убрать цвет {n}', en: 'Remove color {n}' },
  addColor: { ru: 'Добавить цвет', en: 'Add color' },
  insideColor: { ru: 'Цвет множества', en: 'Set color' },
  accentColor: { ru: 'Акцент', en: 'Accent' },

  center: { ru: 'Центр', en: 'Center' },
  zoom: { ru: 'Увеличение', en: 'Zoom' },
  iterations: { ru: 'Итерации', en: 'Iterations' },
  precisionDf64: { ru: 'Эмуляция double: две float32 на координату', en: 'Emulated double: two float32 per coordinate' },
  precisionFp32: { ru: 'Обычная одинарная точность GPU', en: 'Plain single GPU precision' },
  precisionLimit: { ru: 'Предел точности', en: 'Precision limit' },
  zoomIn: { ru: 'Приблизить', en: 'Zoom in' },
  zoomOut: { ru: 'Отдалить', en: 'Zoom out' },
  homeView: { ru: 'Исходный вид', en: 'Reset view' },
  mapLabel: {
    ru: 'Карта: {name}. Стрелки — сдвиг, плюс и минус — масштаб, ноль — сброс.',
    en: 'Map: {name}. Arrows pan, plus and minus zoom, zero resets.',
  },
  wheelHint: {
    ru: 'Чтобы приблизить, крутите колесо с зажатым {mod} или кликните по карте',
    en: 'To zoom, scroll while holding {mod} or click the map first',
  },
  navHint: {
    ru: 'Тяните — сдвиг · {mod} + колесо или щипок — масштаб · двойной клик — приблизить (Shift — отдалить)',
    en: 'Drag to pan · {mod} + scroll or pinch to zoom · double-click to zoom in (Shift to zoom out)',
  },
  colorDensity: { ru: 'Плотность цвета', en: 'Color density' },
  grid: { ru: 'Сетка', en: 'Grid' },
  export: { ru: 'Экспорт', en: 'Export' },
  exportSize: { ru: 'Размер PNG', en: 'PNG size' },
  exportScreen: { ru: 'Как на экране', en: 'Screen size' },
  downloadPng: { ru: 'Скачать PNG', en: 'Download PNG' },
  exportCancel: { ru: 'Отмена · {percent}%', en: 'Cancel · {percent}%' },
  exportFailed: {
    ru: 'Не удалось сохранить картинку: видеокарта не справилась с таким размером.',
    en: 'Could not save the image: the GPU could not handle this size.',
  },
  power: { ru: 'Степень d', en: 'Power d' },
  polynomial: { ru: 'Многочлен p(z)', en: 'Polynomial p(z)' },
  sequence: { ru: 'Последовательность', en: 'Sequence' },
  sequenceLabel: { ru: 'Последовательность из букв A и B', en: 'Sequence of the letters A and B' },
  sequenceHint: { ru: 'A и B, до 16 букв', en: 'A and B, up to 16 letters' },
  juliaParam: { ru: 'Параметр c', en: 'Parameter c' },
  juliaPicker: { ru: 'Параметр c на множестве Мандельброта', en: 'Parameter c on the Mandelbrot set' },

  locations: { ru: 'Известные места', en: 'Famous places' },
  searchTable: { ru: 'Поиск по таблице', en: 'Search the table' },
  place: { ru: 'Место', en: 'Place' },
  goTo: { ru: 'Перейти: {name}', en: 'Go to: {name}' },
  nothingFound: { ru: 'Ничего не найдено', en: 'Nothing found' },
  sortByZoom: { ru: 'Сортировать по увеличению ({order})', en: 'Sort by zoom ({order})' },
  descending: { ru: 'по убыванию', en: 'descending' },
  ascending: { ru: 'по возрастанию', en: 'ascending' },
  polynomialColumn: { ru: 'Многочлен', en: 'Polynomial' },
  powerColumn: { ru: 'Степень', en: 'Power' },

  explainTitle: { ru: 'Как это строится', en: 'How it is built' },
  formulasTitle: { ru: 'Формула по частям', en: 'The formula, piece by piece' },
  exampleTitle: { ru: 'Разбор на примере', en: 'Worked example' },
  exampleChoice: { ru: 'Пример', en: 'Example' },
  exampleMapCenter: { ru: 'Центр карты', en: 'Map center' },
  stepN: { ru: 'Шаг n', en: 'Step n' },
  nearestRoot: { ru: 'Ближайший корень', en: 'Nearest root' },
  distance: { ru: 'Расстояние', en: 'Distance' },
  letter: { ru: 'Буква', en: 'Letter' },
  verdictEscaped: {
    ru: 'На шаге {n} модуль |zₙ| = {abs} > 2: орбита улетает, точка снаружи. Шейдер красит её по ν ≈ {nu}.',
    en: 'At step {n} the modulus |zₙ| = {abs} > 2: the orbit escapes and the point is outside. The shader colors it by ν ≈ {nu}.',
  },
  verdictBounded: {
    ru: 'За {n} шагов модуль |zₙ| ни разу не превысил 2: точка считается частью множества и красится его цветом.',
    en: 'In {n} steps the modulus |zₙ| never exceeded 2: the point counts as part of the set and gets the set color.',
  },
  verdictConverged: {
    ru: 'На шаге {n} точка подошла к корню {root} ближе чем на 10⁻⁵ — пиксель красится цветом этого корня.',
    en: 'At step {n} the point came within 10⁻⁵ of the root {root} — the pixel gets that root’s color.',
  },
  verdictDiverged: {
    ru: 'За {n} шагов метод так и не подошёл ни к одному корню — пиксель красится цветом «внутренности».',
    en: 'In {n} steps the method never got close to any root — the pixel gets the “inside” color.',
  },
  verdictStalled: {
    ru: 'На шаге {n} производная p′(zₙ) равна нулю: касательная горизонтальна, и шаг Ньютона не определён. Пиксель красится цветом «внутренности».',
    en: 'At step {n} the derivative p′(zₙ) is zero: the tangent is horizontal and the Newton step is undefined. The pixel gets the “inside” color.',
  },
  verdictOrder: {
    ru: 'По {total} шагам λ ≈ {lambda} < 0: порядок, отклонения затухают.',
    en: 'Over {total} steps λ ≈ {lambda} < 0: order, deviations die out.',
  },
  verdictChaos: {
    ru: 'По {total} шагам λ ≈ {lambda} > 0: хаос, отклонения растут.',
    en: 'Over {total} steps λ ≈ {lambda} > 0: chaos, deviations grow.',
  },
  warmupNote: {
    ru: 'Первые {warmup} шагов отброшены как переходный процесс, таблица начинается с шага {warmup}.',
    en: 'The first {warmup} steps are discarded as transient, so the table starts at step {warmup}.',
  },
  examplePointC: { ru: 'Точка c = {value}', en: 'Point c = {value}' },
  examplePointZ0: { ru: 'Начальная точка z₀ = {value}', en: 'Starting point z₀ = {value}' },
  examplePointAB: { ru: 'Параметры a = {a}, b = {b}', en: 'Parameters a = {a}, b = {b}' },
  exampleUsesC: { ru: 'c = {value}', en: 'c = {value}' },
} satisfies Record<string, L10n>;

export type UiKey = keyof typeof UI;

/** Строка интерфейса с подстановкой {переменных}. */
export function t(key: UiKey, vars: Record<string, string | number> = {}): string {
  return UI[key][lang].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Для тестов: все ключи словаря интерфейса. */
export const UI_KEYS = Object.keys(UI) as UiKey[];
export const uiText = (key: UiKey): L10n => UI[key];
