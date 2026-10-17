import type { FractalId } from './fractals';
import type { L10n } from './i18n';
import type { Complex } from './polynomial';

/**
 * Тексты раздела «Как это строится»: шаги алгоритма, разбор формулы и точки
 * для примеров. В текстах шагов работают подстановки текущих параметров:
 * {c} — параметр Жюлиа, {d} — степень, {p}, {q} — параметры Феникса,
 * {poly} — многочлен Ньютона, {seq} — последовательность Ляпунова.
 * Формулы записаны мини-разметкой из math.ts.
 */
export interface Explanation {
  intro: L10n;
  steps: { title: L10n; text: L10n }[];
  /** Строки формул; если в строке есть слова — пара { ru, en }. */
  formulas: { caption: L10n; lines: (string | L10n)[] }[];
  /** Что обозначает точка примера: c, z₀ или (a, b). */
  point: 'c' | 'z0' | 'ab';
  examples: { label: L10n; point: Complex }[];
}

const pixelStep = (what: L10n): { title: L10n; text: L10n } => ({
  title: { ru: 'Пиксель → число', en: 'Pixel → number' },
  text: what,
});

const colorEscape: { title: L10n; text: L10n } = {
  title: { ru: 'Цвет', en: 'Color' },
  text: {
    ru: 'Снаружи цвет зависит от того, на каком шаге орбита вышла за круг, — с дробной поправкой ν, чтобы не было ступенек. Если за N шагов орбита так и не вышла, точка считается частью множества и красится его цветом.',
    en: 'Outside, the color depends on the step at which the orbit left the circle, with a fractional correction ν so there are no bands. If the orbit never leaves within N steps, the point is treated as part of the set and gets the set color.',
  },
};

const escapeCheck: { title: L10n; text: L10n } = {
  title: { ru: 'Проверка', en: 'Escape test' },
  text: {
    ru: 'После каждого шага смотрим на модуль |zₙ|. Как только он больше 2, орбита гарантированно улетит на бесконечность — дальше считать незачем.',
    en: 'After every step we look at the modulus |zₙ|. As soon as it exceeds 2, the orbit is guaranteed to fly off to infinity — there is no point in continuing.',
  },
};

const squareFormula = {
  caption: {
    ru: 'Квадрат комплексного числа z = x + iy (помним, что i² = −1)',
    en: 'Squaring a complex number z = x + iy (recall that i² = −1)',
  },
  lines: ['z^2 = (x + iy)^2 = x^2 + 2ixy + i^2y^2', '    = (x^2 − y^2) + i·2xy'],
};

const modulusFormula = {
  caption: { ru: 'Модуль — расстояние до нуля', en: 'Modulus — the distance to zero' },
  lines: ['|z| = √(x^2 + y^2)'],
};

export const EXPLANATIONS: Record<FractalId, Explanation> = {
  mandelbrot: {
    intro: {
      ru: 'Каждый пиксель карты — это комплексное число c. Для него запускается одна и та же короткая итерация, а цвет пикселя показывает, как быстро получившаяся последовательность улетает на бесконечность.',
      en: 'Every pixel on the map is a complex number c. The same short iteration is run for it, and the pixel color shows how quickly the resulting sequence flies off to infinity.',
    },
    steps: [
      pixelStep({
        ru: 'Координаты пикселя переводятся в точку плоскости: c = x + iy, где x — по горизонтальной оси Re, y — по вертикальной оси Im.',
        en: 'The pixel coordinates become a point of the plane: c = x + iy, with x along the horizontal Re axis and y along the vertical Im axis.',
      }),
      {
        title: { ru: 'Старт', en: 'Start' },
        text: { ru: 'Начинаем с нуля: z₀ = 0.', en: 'Start from zero: z₀ = 0.' },
      },
      {
        title: { ru: 'Шаг', en: 'Step' },
        text: {
          ru: 'Каждое следующее число получается из предыдущего: z₁ = z₀^{d} + c, z₂ = z₁^{d} + c и так далее. Сейчас d = {d}.',
          en: 'Each next number comes from the previous one: z₁ = z₀^{d} + c, z₂ = z₁^{d} + c, and so on. Right now d = {d}.',
        },
      },
      escapeCheck,
      colorEscape,
    ],
    formulas: [
      squareFormula,
      {
        caption: {
          ru: 'Поэтому один шаг при d = 2 — это два обычных вещественных равенства',
          en: 'So one step at d = 2 is just two ordinary real equations',
        },
        lines: ['x_{n+1} = x_n^2 − y_n^2 + Re c', 'y_{n+1} = 2·x_n·y_n + Im c'],
      },
      modulusFormula,
    ],
    point: 'c',
    examples: [
      { label: { ru: 'Быстро убегает', en: 'Escapes fast' }, point: [0.5, 0.5] },
      { label: { ru: 'Внутри множества', en: 'Inside the set' }, point: [-0.5, 0.5] },
      { label: { ru: 'Долина коньков', en: 'Seahorse Valley' }, point: [-0.75, 0.1] },
    ],
  },

  julia: {
    intro: {
      ru: 'Формула та же, что у Мандельброта, но роли поменялись: число c одно на всю картинку, а пиксель задаёт начальную точку орбиты z₀.',
      en: 'The formula is the same as Mandelbrot’s, but the roles swap: a single number c is used for the whole picture, and the pixel sets the starting point z₀ of the orbit.',
    },
    steps: [
      pixelStep({
        ru: 'Координаты пикселя становятся начальной точкой: z₀ = x + iy.',
        en: 'The pixel coordinates become the starting point: z₀ = x + iy.',
      }),
      {
        title: { ru: 'Параметр', en: 'Parameter' },
        text: {
          ru: 'Число c одно для всех пикселей. Сейчас c = {c}; его можно поменять на мини-карте под картой.',
          en: 'The number c is the same for all pixels. Right now c = {c}; change it on the mini-map below the map.',
        },
      },
      {
        title: { ru: 'Шаг', en: 'Step' },
        text: {
          ru: 'zₙ₊₁ = zₙ^{d} + c, где d = {d}. Каждое число — из предыдущего.',
          en: 'zₙ₊₁ = zₙ^{d} + c with d = {d}. Each number comes from the previous one.',
        },
      },
      escapeCheck,
      colorEscape,
    ],
    formulas: [
      squareFormula,
      {
        caption: { ru: 'Один шаг при d = 2', en: 'One step at d = 2' },
        lines: ['x_{n+1} = x_n^2 − y_n^2 + Re c', 'y_{n+1} = 2·x_n·y_n + Im c'],
      },
      {
        caption: {
          ru: 'Связь с Мандельбротом: множество Жюлиа связно, только если c лежит в множестве Мандельброта',
          en: 'Link to Mandelbrot: the Julia set is connected exactly when c lies in the Mandelbrot set',
        },
        lines: [{ ru: 'K_c связно ⇔ c ∈ M', en: 'K_c is connected ⇔ c ∈ M' }],
      },
    ],
    point: 'z0',
    examples: [
      { label: { ru: 'Из нуля', en: 'From zero' }, point: [0, 0] },
      { label: { ru: 'z₀ = 0.6 + 0.4i', en: 'z₀ = 0.6 + 0.4i' }, point: [0.6, 0.4] },
      { label: { ru: 'Далеко от центра', en: 'Far from the center' }, point: [1.2, 0.3] },
    ],
  },

  'burning-ship': {
    intro: {
      ru: 'Это Мандельброт с одной поправкой: перед возведением в квадрат у обеих частей числа отбрасывается знак. Из-за этого пропадает симметрия и появляются «корабли».',
      en: 'This is Mandelbrot with a single twist: before squaring, both parts of the number lose their sign. That breaks the symmetry and makes the “ships” appear.',
    },
    steps: [
      pixelStep({
        ru: 'Пиксель задаёт c = x + iy. Мнимая ось здесь направлена вниз — так корабли стоят мачтами вверх.',
        en: 'The pixel gives c = x + iy. The imaginary axis points down here, so the ships stand masts-up.',
      }),
      {
        title: { ru: 'Старт', en: 'Start' },
        text: { ru: 'z₀ = 0.', en: 'z₀ = 0.' },
      },
      {
        title: { ru: 'Модули', en: 'Absolute values' },
        text: {
          ru: 'Перед каждым шагом заменяем x и y на |x| и |y| — число переносится в правую верхнюю четверть плоскости.',
          en: 'Before each step x and y are replaced by |x| and |y|, which moves the number into the upper-right quadrant.',
        },
      },
      {
        title: { ru: 'Шаг', en: 'Step' },
        text: { ru: 'zₙ₊₁ = (|xₙ| + i|yₙ|)² + c.', en: 'zₙ₊₁ = (|xₙ| + i|yₙ|)² + c.' },
      },
      escapeCheck,
      colorEscape,
    ],
    formulas: [
      {
        caption: { ru: 'Квадрат после взятия модулей', en: 'The square after taking absolute values' },
        lines: ['(|x| + i|y|)^2 = x^2 − y^2 + i·2|xy|'],
      },
      {
        caption: { ru: 'Один шаг', en: 'One step' },
        lines: ['x_{n+1} = x_n^2 − y_n^2 + Re c', 'y_{n+1} = 2·|x_n·y_n| + Im c'],
      },
      {
        caption: {
          ru: 'Отличие от Мандельброта — только модуль во второй строке',
          en: 'The only difference from Mandelbrot is the absolute value in the second line',
        },
        lines: ['Mandelbrot: y_{n+1} = 2·x_n·y_n + Im c'],
      },
    ],
    point: 'c',
    examples: [
      { label: { ru: 'На корабле', en: 'On the ship' }, point: [-1.755, -0.02] },
      { label: { ru: 'Внутри корпуса', en: 'Inside the hull' }, point: [-0.5, -0.3] },
      { label: { ru: 'Снаружи', en: 'Outside' }, point: [1, 0.5] },
    ],
  },

  tricorn: {
    intro: {
      ru: 'Трикорн — Мандельброт с комплексным сопряжением: перед возведением в степень у мнимой части меняется знак. Вместо кардиоиды получается фигура с тремя рогами.',
      en: 'The Tricorn is Mandelbrot with complex conjugation: before raising to a power, the imaginary part flips sign. Instead of a cardioid you get a shape with three horns.',
    },
    steps: [
      pixelStep({
        ru: 'Пиксель задаёт c = x + iy.',
        en: 'The pixel gives c = x + iy.',
      }),
      {
        title: { ru: 'Старт', en: 'Start' },
        text: { ru: 'z₀ = 0.', en: 'z₀ = 0.' },
      },
      {
        title: { ru: 'Сопряжение', en: 'Conjugation' },
        text: {
          ru: 'Перед шагом z = x + iy заменяется на z̄ = x − iy — зеркальное отражение относительно оси Re.',
          en: 'Before each step z = x + iy becomes z̄ = x − iy — its mirror image across the Re axis.',
        },
      },
      {
        title: { ru: 'Шаг', en: 'Step' },
        text: {
          ru: 'zₙ₊₁ = z̄ₙ^{d} + c, где d = {d}. У множества получается d + 1 рог.',
          en: 'zₙ₊₁ = z̄ₙ^{d} + c with d = {d}. The set ends up with d + 1 horns.',
        },
      },
      escapeCheck,
      colorEscape,
    ],
    formulas: [
      {
        caption: { ru: 'Квадрат сопряжённого числа', en: 'Square of the conjugate' },
        lines: ['z̄^2 = (x − iy)^2 = x^2 − y^2 − i·2xy'],
      },
      {
        caption: { ru: 'Один шаг при d = 2', en: 'One step at d = 2' },
        lines: ['x_{n+1} = x_n^2 − y_n^2 + Re c', 'y_{n+1} = −2·x_n·y_n + Im c'],
      },
    ],
    point: 'c',
    examples: [
      { label: { ru: 'Внутри', en: 'Inside' }, point: [-0.15, 0] },
      { label: { ru: 'На роге', en: 'On a horn' }, point: [-1.3, 0.02] },
      { label: { ru: 'Снаружи', en: 'Outside' }, point: [0.6, 0.6] },
    ],
  },

  newton: {
    intro: {
      ru: 'Здесь орбита не улетает на бесконечность, а сходится: метод Ньютона ищет корень многочлена, начиная с точки пикселя. Цвет показывает, к какому корню пришёл метод и как быстро.',
      en: 'Here the orbit does not fly away — it converges: Newton’s method looks for a root of a polynomial, starting from the pixel’s point. The color shows which root it reached and how fast.',
    },
    steps: [
      pixelStep({
        ru: 'Пиксель задаёт начальное приближение z₀ = x + iy. Многочлен сейчас p(z) = {poly}.',
        en: 'The pixel gives the initial guess z₀ = x + iy. The polynomial is currently p(z) = {poly}.',
      }),
      {
        title: { ru: 'Значение и производная', en: 'Value and derivative' },
        text: {
          ru: 'В текущей точке считаем p(zₙ) и p′(zₙ) — за один проход по коэффициентам (схема Горнера).',
          en: 'At the current point compute p(zₙ) and p′(zₙ) in one pass over the coefficients (Horner’s scheme).',
        },
      },
      {
        title: { ru: 'Шаг Ньютона', en: 'Newton step' },
        text: {
          ru: 'Сдвигаемся туда, где касательная к p пересекает ноль: zₙ₊₁ = zₙ − p(zₙ) / p′(zₙ).',
          en: 'Move to where the tangent of p crosses zero: zₙ₊₁ = zₙ − p(zₙ) / p′(zₙ).',
        },
      },
      {
        title: { ru: 'Проверка', en: 'Convergence test' },
        text: {
          ru: 'Если zₙ подошло к одному из корней ближе чем на 10⁻⁵ — метод сошёлся. Корни заранее найдены на процессоре.',
          en: 'If zₙ is within 10⁻⁵ of one of the roots, the method has converged. The roots are found beforehand on the CPU.',
        },
      },
      {
        title: { ru: 'Цвет', en: 'Color' },
        text: {
          ru: 'Каждому корню отведён свой участок палитры, а оттенок внутри участка зависит от числа шагов. Если метод не сошёлся (бывает у z³ − 2z + 2), пиксель красится цветом «внутренности».',
          en: 'Each root gets its own stretch of the palette, and the shade within it depends on the number of steps. If the method does not converge (this happens for z³ − 2z + 2), the pixel gets the “inside” color.',
        },
      },
    ],
    formulas: [
      {
        caption: { ru: 'Для p(z) = z³ − 1 шаг Ньютона упрощается', en: 'For p(z) = z³ − 1 the Newton step simplifies' },
        lines: ['z_{n+1} = z_n − (z_n^3 − 1) / (3z_n^2) = (2z_n^3 + 1) / (3z_n^2)'],
      },
      {
        caption: { ru: 'Деление комплексных чисел', en: 'Dividing complex numbers' },
        lines: ['a / b = a · b̄ / |b|^2'],
      },
      {
        caption: { ru: 'Схема Горнера для p и p′', en: 'Horner’s scheme for p and p′' },
        lines: ['p(z) = (…((a_m·z + a_{m−1})·z + a_{m−2})·z + …)·z + a_0'],
      },
    ],
    point: 'z0',
    examples: [
      { label: { ru: 'Справа', en: 'On the right' }, point: [2, 0] },
      { label: { ru: 'Слева сверху', en: 'Upper left' }, point: [-0.5, 0.5] },
      { label: { ru: 'У границы бассейнов', en: 'Near a basin boundary' }, point: [-0.6, 0.05] },
    ],
  },

  phoenix: {
    intro: {
      ru: 'Феникс похож на Жюлиа, но у каждого шага есть «память»: в формулу входит не только текущая точка орбиты, но и предыдущая.',
      en: 'The Phoenix is like a Julia set, but every step has a “memory”: the formula uses not only the current orbit point but the previous one too.',
    },
    steps: [
      pixelStep({
        ru: 'Пиксель задаёт начальную точку z₀. Картинка повёрнута: по горизонтали отложена Im z₀, по вертикали — Re z₀.',
        en: 'The pixel gives the starting point z₀. The picture is rotated: Im z₀ runs horizontally and Re z₀ vertically.',
      }),
      {
        title: { ru: 'Параметры', en: 'Parameters' },
        text: {
          ru: 'Два вещественных числа: сейчас p = {p}, q = {q}. Их можно менять ползунками под картой.',
          en: 'Two real numbers: right now p = {p}, q = {q}. Change them with the sliders below the map.',
        },
      },
      {
        title: { ru: 'Шаг с памятью', en: 'A step with memory' },
        text: {
          ru: 'zₙ₊₁ = zₙ² + p + q·zₙ₋₁. Перед первым шагом считаем z₋₁ = 0.',
          en: 'zₙ₊₁ = zₙ² + p + q·zₙ₋₁. Before the first step take z₋₁ = 0.',
        },
      },
      escapeCheck,
      colorEscape,
    ],
    formulas: [
      {
        caption: { ru: 'Один шаг в вещественной записи', en: 'One step written with real numbers' },
        lines: ['x_{n+1} = x_n^2 − y_n^2 + p + q·x_{n−1}', 'y_{n+1} = 2·x_n·y_n + q·y_{n−1}'],
      },
      {
        caption: {
          ru: 'При q = 0 память исчезает, и это обычное множество Жюлиа с вещественным c = p',
          en: 'With q = 0 the memory disappears and it is an ordinary Julia set with real c = p',
        },
        lines: ['q = 0:  z_{n+1} = z_n^2 + p'],
      },
    ],
    point: 'z0',
    examples: [
      { label: { ru: 'Из нуля', en: 'From zero' }, point: [0, 0] },
      { label: { ru: 'На крыле', en: 'On a wing' }, point: [0.1, 0.5] },
      { label: { ru: 'Снаружи', en: 'Outside' }, point: [1, 0.5] },
    ],
  },

  lyapunov: {
    intro: {
      ru: 'Эта картинка — не комплексная плоскость, а плоскость двух параметров (a, b) логистического отображения. Для каждой пары мы выясняем, ведёт ли себя система упорядоченно или хаотично.',
      en: 'This picture is not the complex plane but the plane of two parameters (a, b) of the logistic map. For every pair we find out whether the system behaves in an orderly or chaotic way.',
    },
    steps: [
      pixelStep({
        ru: 'Пиксель задаёт пару параметров: a — по горизонтали, b — по вертикали.',
        en: 'The pixel gives a pair of parameters: a horizontally, b vertically.',
      }),
      {
        title: { ru: 'Последовательность', en: 'Sequence' },
        text: {
          ru: 'Строка {seq} повторяется по кругу: на шаге n берём rₙ = a, если буква A, и rₙ = b, если B.',
          en: 'The string {seq} repeats over and over: at step n take rₙ = a for the letter A and rₙ = b for B.',
        },
      },
      {
        title: { ru: 'Шаг', en: 'Step' },
        text: {
          ru: 'Начинаем с x₀ = ½ и считаем xₙ₊₁ = rₙ·xₙ(1 − xₙ). Первые шаги отбрасываем, пока система не «успокоится».',
          en: 'Start from x₀ = ½ and compute xₙ₊₁ = rₙ·xₙ(1 − xₙ). The first steps are discarded while the system settles.',
        },
      },
      {
        title: { ru: 'Показатель Ляпунова', en: 'Lyapunov exponent' },
        text: {
          ru: 'На каждом шаге добавляем ln|rₙ(1 − 2xₙ)| — логарифм того, во сколько раз шаг растягивает маленькие отклонения. Среднее по всем шагам — это λ.',
          en: 'At every step add ln|rₙ(1 − 2xₙ)| — the log of how much the step stretches small deviations. The average over all steps is λ.',
        },
      },
      {
        title: { ru: 'Цвет', en: 'Color' },
        text: {
          ru: 'λ < 0 — порядок: отклонения затухают, орбита притягивается к циклу; красим градиентом. λ > 0 — хаос: отклонения растут; красим почти цветом «внутренности».',
          en: 'λ < 0 means order: deviations die out and the orbit settles into a cycle; it is painted with the gradient. λ > 0 means chaos: deviations grow; it is painted almost in the “inside” color.',
        },
      },
    ],
    formulas: [
      {
        caption: { ru: 'Логистическое отображение и его производная', en: 'The logistic map and its derivative' },
        lines: ['f_r(x) = r·x(1 − x)', 'f_r′(x) = r(1 − 2x)'],
      },
      {
        caption: { ru: 'Показатель Ляпунова', en: 'The Lyapunov exponent' },
        lines: ['λ ≈ (1/N) · Σ ln|r_n(1 − 2x_n)|'],
      },
    ],
    point: 'ab',
    examples: [
      { label: { ru: 'Порядок', en: 'Order' }, point: [3.2, 3.3] },
      { label: { ru: 'Граница', en: 'Boundary' }, point: [3.55, 3.75] },
      { label: { ru: 'Хаос', en: 'Chaos' }, point: [3.9, 3.95] },
    ],
  },
};
