import { formatFixed, formatZoom, h } from './dom';
import type { Control, FractalDef, Location } from './fractals';
import { findPolynomial } from './polynomial';
import { t, tr } from './i18n';

/** Подпись для параметра c множества Жюлиа: «−0.123 + 0.745i». */
export function formatComplex([re, im]: [number, number], decimals = 3): string {
  const sign = im < 0 ? '−' : '+';
  return `${formatFixed(re, decimals)} ${sign} ${formatFixed(Math.abs(im), decimals)}i`;
}

/** Колонка параметра в таблице мест: у каждого фрактала своя или никакой. */
function paramColumn(def: FractalDef): { header: string; cell: (loc: Location) => string } | null {
  const has = (control: Control): boolean => def.controls.includes(control);
  if (has('julia')) return { header: t('juliaParam'), cell: (loc) => (loc.param ? formatComplex(loc.param) : '—') };
  if (has('phoenix')) {
    return {
      header: 'p, q',
      cell: (loc) => (loc.param ? `${formatFixed(loc.param[0], 3)}, ${formatFixed(loc.param[1], 3)}` : '—'),
    };
  }
  if (has('sequence')) return { header: t('sequence'), cell: (loc) => loc.sequence ?? '—' };
  if (has('poly')) return { header: t('polynomialColumn'), cell: (loc) => findPolynomial(loc.poly).label };
  if (has('power') && def.locations.some((loc) => loc.power)) {
    return { header: t('powerColumn'), cell: (loc) => `d = ${loc.power ?? 2}` };
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
  const sortButton = h('button', { class: 'th-sort', type: 'button' }, t('zoom'));
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: t('searchTable'),
    'aria-label': t('searchTable'),
  });

  const rowFor = (loc: Location): HTMLTableRowElement => {
    const decimals = Math.min(15, Math.max(2, Math.ceil(-Math.log10(loc.view.span)) + 2));
    const zoom = zoomOf(loc);
    const param = paramCol?.cell(loc) ?? null;
    const row = h(
      'tr',
      { tabindex: '0', 'aria-label': t('goTo', { name: tr(loc.name) }) },
      h('td', { class: 'td-name' }, h('span', { class: 'link' }, tr(loc.name))),
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
      // Ищем по обоим языкам: место находится и по русскому, и по английскому названию.
      `${loc.name.ru} ${loc.name.en} ${paramCol?.cell(loc) ?? ''}`.toLowerCase().includes(needle),
    );
    if (order !== 'none') {
      const dir = order === 'desc' ? -1 : 1;
      visible.sort((a, b) => dir * (zoomOf(a.loc) - zoomOf(b.loc)));
    }
    tbody.replaceChildren(
      ...visible.map((r) => r.row),
      ...(visible.length
        ? []
        : [h('tr', { class: 'empty' }, h('td', { colspan: String(columns) }, t('nothingFound')))]),
    );
    sortButton.dataset.order = order;
    sortButton.setAttribute('aria-label', t('sortByZoom', { order: t(order === 'desc' ? 'descending' : 'ascending') }));
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
    h('div', { class: 'locations-head' }, h('h2', { class: 'section-title' }, t('locations')), search),
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
            h('th', {}, t('place')),
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
