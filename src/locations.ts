import { formatFixed, formatZoom, h } from './dom';
import type { Control, FractalDef, Location } from './fractals';
import { findPolynomial } from './polynomial';

/** Подпись для параметра c множества Жюлиа: «−0.123 + 0.745i». */
export function formatComplex([re, im]: [number, number], decimals = 3): string {
  const sign = im < 0 ? '−' : '+';
  return `${formatFixed(re, decimals)} ${sign} ${formatFixed(Math.abs(im), decimals)}i`;
}

/** Колонка параметра в таблице мест: у каждого фрактала своя или никакой. */
function paramColumn(def: FractalDef): { header: string; cell: (loc: Location) => string } | null {
  const has = (control: Control): boolean => def.controls.includes(control);
  if (has('julia')) return { header: 'Параметр c', cell: (loc) => (loc.param ? formatComplex(loc.param) : '—') };
  if (has('phoenix')) {
    return {
      header: 'p, q',
      cell: (loc) => (loc.param ? `${formatFixed(loc.param[0], 3)}, ${formatFixed(loc.param[1], 3)}` : '—'),
    };
  }
  if (has('sequence')) return { header: 'Последовательность', cell: (loc) => loc.sequence ?? '—' };
  if (has('poly')) return { header: 'Многочлен', cell: (loc) => findPolynomial(loc.poly).label };
  if (has('power') && def.locations.some((loc) => loc.power)) {
    return { header: 'Степень', cell: (loc) => `d = ${loc.power ?? 2}` };
  }
  return null;
}

/**
 * Таблица «Известные места» — по мотивам таблицы опросов под графиком:
 * поиск, сортировка по увеличению и серая плашка-шкала в колонке масштаба.
 * Клик по строке отправляет камеру в это место.
 */
export function createLocationsTable(def: FractalDef, onSelect: (loc: Location) => void): HTMLElement {
  const paramCol = paramColumn(def);
  const paramHeader = paramCol?.header ?? null;
  const zoomOf = (loc: Location): number => def.home.span / loc.view.span;
  const maxLogZoom = Math.max(1, ...def.locations.map((loc) => Math.log10(zoomOf(loc)) + 1));
  // У Жюлиа все места — разные c в одном кадре: колонки центра и увеличения там пусты.
  const showZoom = def.locations.some((loc) => zoomOf(loc) >= 2);
  const showCenter = def.locations.some((loc) => loc.view.cx !== def.home.cx || loc.view.cy !== def.home.cy);
  const columns = 1 + [showCenter, paramHeader, showZoom].filter(Boolean).length;

  let order: 'none' | 'desc' | 'asc' = 'none';
  let filter = '';

  const tbody = h('tbody');
  const sortButton = h('button', { class: 'th-sort', type: 'button' }, 'Увеличение');
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Поиск по таблице',
    'aria-label': 'Поиск по таблице',
  });

  const rowFor = (loc: Location): HTMLTableRowElement => {
    const decimals = Math.min(15, Math.max(2, Math.ceil(-Math.log10(loc.view.span)) + 2));
    const zoom = zoomOf(loc);
    const param = paramCol?.cell(loc) ?? null;
    const row = h(
      'tr',
      { tabindex: '0', 'aria-label': `Перейти: ${loc.name}` },
      h('td', { class: 'td-name' }, h('span', { class: 'link' }, loc.name)),
      showCenter &&
        h(
          'td',
          { class: 'td-mono td-center' },
          `${formatFixed(loc.view.cx, decimals)}, ${formatFixed(loc.view.cy, decimals)}`,
        ),
      paramHeader ? h('td', { class: 'td-mono td-param' }, param ?? '—') : null,
      showZoom &&
        h(
          'td',
          { class: 'td-zoom' },
          h(
            'span',
            { class: 'zoom-bar' },
            h('span', {
              class: 'zoom-bar-fill',
              style: `width: ${((Math.log10(zoom) + 1) / maxLogZoom) * 100}%`,
            }),
            h('span', { class: 'zoom-bar-value' }, formatZoom(zoom)),
          ),
        ),
    );
    row.addEventListener('click', () => onSelect(loc));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(loc);
      }
    });
    return row;
  };

  const rows = def.locations.map((loc) => ({ loc, row: rowFor(loc) }));

  const refresh = (): void => {
    const needle = filter.trim().toLowerCase();
    const visible = rows.filter(({ loc }) =>
      `${loc.name} ${paramCol?.cell(loc) ?? ''}`.toLowerCase().includes(needle),
    );
    if (order !== 'none') {
      const dir = order === 'desc' ? -1 : 1;
      visible.sort((a, b) => dir * (zoomOf(a.loc) - zoomOf(b.loc)));
    }
    tbody.replaceChildren(
      ...visible.map((r) => r.row),
      ...(visible.length
        ? []
        : [h('tr', { class: 'empty' }, h('td', { colspan: String(columns) }, 'Ничего не найдено'))]),
    );
    sortButton.dataset.order = order;
    sortButton.setAttribute('aria-label', `Сортировать по увеличению (${order === 'desc' ? 'по убыванию' : 'по возрастанию'})`);
  };

  sortButton.addEventListener('click', () => {
    order = order === 'desc' ? 'asc' : 'desc';
    refresh();
  });
  search.addEventListener('input', () => {
    filter = search.value;
    refresh();
  });
  refresh();

  return h(
    'section',
    { class: 'locations' },
    h('div', { class: 'locations-head' }, h('h2', { class: 'section-title' }, 'Известные места'), search),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', {}, 'Место'),
            showCenter && h('th', {}, def.axes.join(', ')),
            paramHeader ? h('th', {}, paramHeader) : null,
            showZoom && h('th', { class: 'th-zoom' }, sortButton),
          ),
        ),
        tbody,
      ),
    ),
  );
}
