import { formatFixed, h } from './dom';
import { EXPLANATIONS } from './explain';
import type { FractalDef, FractalParams, View } from './fractals';
import { t, tr } from './i18n';
import { formatComplex } from './locations';
import { mathEl } from './math';
import { escapeOrbit, lyapunovOrbit, newtonOrbit, CONFIRM_STEPS, type Orbit } from './orbits';
import { findPolynomial, type Complex } from './polynomial';

/** Сколько шагов показывать в таблице примера (плюс шаг выхода, если он позже). */
const TABLE_ROWS = 10;

/**
 * Раздел «Как это строится» внизу страницы фрактала: шаги алгоритма, формула
 * по частям и разбор на примере — таблица шагов орбиты для выбранной точки.
 * Таблица считается теми же итерациями, что и шейдер, и учитывает текущие
 * параметры (степень, c, p и q, многочлен, последовательность).
 */
export function createExplanation(
  def: FractalDef,
  getParams: () => FractalParams,
  getView: () => View,
  getIterations: () => number,
): { el: HTMLElement; update: () => void } {
  const content = EXPLANATIONS[def.id];
  const stepsList = h('ol', { class: 'explain-steps' });
  const tabs = h('div', { class: 'segmented explain-tabs', role: 'group', 'aria-label': t('exampleChoice') });
  const pointLine = h('p', { class: 'explain-point' });
  const tableWrap = h('div', { class: 'table-scroll' });
  const verdict = h('p', { class: 'explain-verdict' });
  const note = h('p', { class: 'explain-note' });

  // Последняя вкладка — центр карты: пример следует за тем, что сейчас на экране.
  const options: { label: string; point: () => Complex }[] = [
    ...content.examples.map((ex) => ({ label: tr(ex.label), point: (): Complex => ex.point })),
    { label: t('exampleMapCenter'), point: () => viewPoint(def, getView()) },
  ];
  let selected = 0;
  const buttons = options.map((option, i) => {
    const button = h('button', { class: 'seg', type: 'button' }, option.label);
    button.addEventListener('click', () => {
      selected = i;
      update();
    });
    return button;
  });
  tabs.append(...buttons);

  const formulas = content.formulas.map((formula) =>
    h(
      'figure',
      { class: 'explain-formula' },
      h('figcaption', {}, tr(formula.caption)),
      ...formula.lines.map((line) => h('div', { class: 'math-line' }, mathEl(typeof line === 'string' ? line : tr(line)))),
    ),
  );

  function update(): void {
    const params = getParams();
    const vars = placeholders(def, params);

    stepsList.replaceChildren(
      ...content.steps.map((step) =>
        h(
          'li',
          {},
          h('strong', {}, tr(step.title)),
          ' ',
          mathEl(fill(tr(step.text), vars), 'math-inline'),
        ),
      ),
    );

    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === selected)));
    const point = options[selected]!.point();
    const orbit = computeOrbit(def, point, params, getIterations());
    pointLine.replaceChildren(pointDescription(def, point, params));
    tableWrap.replaceChildren(renderTable(orbit));
    verdict.textContent = verdictText(orbit);
    note.textContent = orbit.kind === 'lyapunov' ? t('warmupNote', { warmup: orbit.warmup }) : '';
    note.hidden = orbit.kind !== 'lyapunov';
  }

  const el = h(
    'section',
    { class: 'explain', 'aria-labelledby': 'explain-title' },
    h('h2', { class: 'section-title', id: 'explain-title' }, t('explainTitle')),
    h('p', { class: 'lede explain-intro' }, tr(content.intro)),
    stepsList,
    h('h3', { class: 'explain-subtitle' }, t('formulasTitle')),
    h('div', { class: 'explain-formulas' }, ...formulas),
    h('h3', { class: 'explain-subtitle' }, t('exampleTitle')),
    tabs,
    pointLine,
    note,
    tableWrap,
    verdict,
  );
  update();
  return { el, update };
}

/** Точка в «родных» координатах фрактала для центра карты. */
function viewPoint(def: FractalDef, view: View): Complex {
  // Феникс нарисован повёрнутым: по горизонтали Im z₀, по вертикали Re z₀.
  return def.id === 'phoenix' ? [view.cy, view.cx] : [view.cx, view.cy];
}

function placeholders(def: FractalDef, params: FractalParams): Record<string, string> {
  const power = def.controls.includes('power') ? params.power : 2;
  return {
    c: formatComplex(params.param),
    d: String(power),
    p: formatFixed(params.param[0], 3),
    q: formatFixed(params.param[1], 3),
    poly: findPolynomial(params.poly).label,
    seq: params.sequence,
  };
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}

function computeOrbit(def: FractalDef, point: Complex, params: FractalParams, iterations: number): Orbit {
  if (def.id === 'newton') return newtonOrbit(point, params.poly, TABLE_ROWS);
  if (def.id === 'lyapunov') return lyapunovOrbit(point, params.sequence, iterations, TABLE_ROWS);
  return escapeOrbit(def, point, params, TABLE_ROWS);
}

function pointDescription(def: FractalDef, point: Complex, params: FractalParams): HTMLElement {
  const content = EXPLANATIONS[def.id];
  if (content.point === 'ab') {
    return h('span', {}, t('examplePointAB', { a: formatFixed(point[0], 4), b: formatFixed(point[1], 4) }));
  }
  const value = formatComplex(point, 4);
  if (content.point === 'c') return h('span', {}, t('examplePointC', { value }));
  // У Жюлиа рядом с z₀ полезно видеть и c — он участвует в каждом шаге.
  const extra = def.id === 'julia' ? ` · ${t('exampleUsesC', { value: formatComplex(params.param) })}` : '';
  return h('span', {}, t('examplePointZ0', { value }) + extra);
}

const num = (v: number, digits = 4): string =>
  Math.abs(v) >= 1e6 ? v.toExponential(2).replace('-', '−') : formatFixed(v, digits);

function renderTable(orbit: Orbit): HTMLTableElement {
  const head = (labels: (string | HTMLElement)[]): HTMLElement =>
    h('thead', {}, h('tr', {}, ...labels.map((l) => h('th', {}, l))));
  const gapRow = (cols: number): HTMLTableRowElement =>
    h('tr', { class: 'explain-gap' }, h('td', { colspan: String(cols) }, '…'));

  if (orbit.kind === 'escape') {
    const rows: HTMLTableRowElement[] = [];
    orbit.steps.forEach((step, i) => {
      if (i > 0 && step.n - orbit.steps[i - 1]!.n > 1) rows.push(gapRow(3));
      const escaped = step.n === orbit.escapedAt;
      rows.push(
        h(
          'tr',
          { class: escaped ? 'is-hit' : null },
          h('td', { class: 'td-mono' }, String(step.n)),
          h('td', { class: 'td-mono' }, complexCell(step.z)),
          h('td', { class: 'td-mono' }, num(step.abs)),
        ),
      );
    });
    return h(
      'table',
      { class: 'table explain-table' },
      head([t('stepN'), mathEl('z_n'), mathEl('|z_n|')]),
      h('tbody', {}, ...rows),
    );
  }

  if (orbit.kind === 'newton') {
    const rows: HTMLTableRowElement[] = [];
    orbit.steps.forEach((step, i) => {
      if (i > 0 && step.n - orbit.steps[i - 1]!.n > 1) rows.push(gapRow(4));
      const hit = orbit.converged?.at === step.n;
      rows.push(
        h(
          'tr',
          { class: hit ? 'is-hit' : null },
          h('td', { class: 'td-mono' }, String(step.n)),
          h('td', { class: 'td-mono' }, complexCell(step.z)),
          h('td', { class: 'td-mono' }, formatComplex(orbit.roots[step.root]!, 3)),
          h('td', { class: 'td-mono' }, step.distance < 1e-4 ? step.distance.toExponential(1).replace('-', '−') : num(step.distance)),
        ),
      );
    });
    return h(
      'table',
      { class: 'table explain-table' },
      head([t('stepN'), mathEl('z_n'), t('nearestRoot'), t('distance')]),
      h('tbody', {}, ...rows),
    );
  }

  return h(
    'table',
    { class: 'table explain-table' },
    head([t('stepN'), t('letter'), mathEl('r_n'), mathEl('x_n'), mathEl('ln|r_n(1 − 2x_n)|')]),
    h(
      'tbody',
      {},
      ...orbit.steps.map((step) =>
        h(
          'tr',
          {},
          h('td', { class: 'td-mono' }, String(step.n)),
          h('td', { class: 'td-mono' }, step.letter),
          h('td', { class: 'td-mono' }, num(step.r)),
          h('td', { class: 'td-mono' }, num(step.x)),
          h('td', { class: 'td-mono' }, num(step.term)),
        ),
      ),
    ),
  );
}

function complexCell(z: Complex): string {
  const big = Math.max(Math.abs(z[0]), Math.abs(z[1])) >= 1e6;
  if (!big) return formatComplex(z, 4);
  const sign = z[1] < 0 ? '−' : '+';
  return `${num(z[0])} ${sign} ${num(Math.abs(z[1]))}i`;
}

function verdictText(orbit: Orbit): string {
  if (orbit.kind === 'escape') {
    if (orbit.escapedAt === null) return t('verdictBounded', { n: CONFIRM_STEPS });
    const last = orbit.steps.at(-1)!;
    return t('verdictEscaped', { n: orbit.escapedAt, abs: num(last.abs, 3), nu: num(orbit.nu ?? 0, 2) });
  }
  if (orbit.kind === 'newton') {
    if (orbit.stalledAt !== null) return t('verdictStalled', { n: orbit.stalledAt });
    if (!orbit.converged) return t('verdictDiverged', { n: CONFIRM_STEPS });
    return t('verdictConverged', {
      n: orbit.converged.at,
      root: formatComplex(orbit.roots[orbit.converged.root]!, 3),
    });
  }
  const lambda = num(orbit.lambda, 3);
  return orbit.lambda < 0
    ? t('verdictOrder', { total: orbit.total, lambda })
    : t('verdictChaos', { total: orbit.total, lambda });
}

