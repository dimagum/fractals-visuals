import { h } from './dom';
import { FRACTALS, type FractalId } from './fractals';
import { PALETTES, gradientCss } from './palettes';
import { colors, currentPalette, setPalette, subscribe } from './store';

interface ToolbarOptions {
  fractalId: FractalId | null;
  onFractal: (id: FractalId) => void;
}

/**
 * Верхняя панель: таблетки цветовых гамм и выпадающий список фракталов —
 * та же пара «вкладки + селектор», что над графиками штатов у Silver Bulletin.
 */
export function createToolbar({ fractalId, onFractal }: ToolbarOptions): { el: HTMLElement; destroy: () => void } {
  const pills = PALETTES.map((palette) => {
    const swatch = h('span', { class: 'pill-swatch', 'aria-hidden': 'true' });
    const button = h(
      'button',
      { class: 'pill', type: 'button', onclick: () => setPalette(palette.id) },
      swatch,
      palette.name,
    );
    return { palette, button, swatch };
  });

  const select = h(
    'select',
    { class: 'picker-select', 'aria-label': 'Фрактал' },
    fractalId ? null : h('option', { value: '', selected: true, disabled: true }, 'Выбрать фрактал'),
    ...FRACTALS.map((f) =>
      h('option', { value: f.id, selected: f.id === fractalId }, `${f.short} · ${f.tag}`),
    ),
  );
  select.addEventListener('change', () => onFractal(select.value as FractalId));

  const sync = (): void => {
    const active = currentPalette();
    for (const { palette, button, swatch } of pills) {
      button.setAttribute('aria-pressed', String(palette === active));
      swatch.style.background = gradientCss(colors(palette));
    }
  };
  sync();
  const unsubscribe = subscribe(sync);

  const el = h(
    'nav',
    { class: 'toolbar', 'aria-label': 'Гамма и фрактал' },
    h('div', { class: 'pills', role: 'group', 'aria-label': 'Цветовая гамма' }, ...pills.map((p) => p.button)),
    h('label', { class: 'picker' }, select),
  );
  return { el, destroy: unsubscribe };
}
