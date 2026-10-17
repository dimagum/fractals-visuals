import { h } from './dom';
import { FRACTALS, type FractalId } from './fractals';
import { CUSTOM_ID, DEFAULT_CUSTOM, MAX_STOPS, PALETTES, gradientCss, type PaletteColors } from './palettes';
import { colors, currentPalette, customColors, paletteById, setCustomColors, setPalette, subscribe } from './store';
import { t, tr } from './i18n';

interface ToolbarOptions {
  fractalId: FractalId | null;
  onFractal: (id: FractalId) => void;
}

/**
 * Верхняя панель: таблетки цветовых гамм и выпадающий список фракталов —
 * та же пара «вкладки + селектор», что над графиками штатов у Silver Bulletin.
 * Последняя таблетка — своя гамма; повторный клик по ней открывает редактор.
 */
export function createToolbar({ fractalId, onFractal }: ToolbarOptions): { el: HTMLElement; destroy: () => void } {
  const ids = [...PALETTES.map((p) => p.id), CUSTOM_ID];
  let editorOpen = false;

  const pills = ids.map((id) => {
    const swatch = h('span', { class: 'pill-swatch', 'aria-hidden': 'true' });
    const isCustom = id === CUSTOM_ID;
    const button = h(
      'button',
      {
        class: `pill${isCustom ? ' pill-custom' : ''}`,
        type: 'button',
        'aria-expanded': isCustom ? 'false' : null,
        'aria-controls': isCustom ? 'palette-editor' : null,
        onclick: () => {
          if (isCustom) {
            // Первый клик выбирает свою гамму и открывает редактор, следующий — закрывает его.
            editorOpen = currentPalette().id === CUSTOM_ID ? !editorOpen : true;
          } else {
            editorOpen = false;
          }
          setPalette(id);
          sync();
        },
      },
      swatch,
      tr(paletteById(id).name),
      isCustom ? h('span', { class: 'pill-edit', 'aria-hidden': 'true' }, '✎') : null,
    );
    return { id, button, swatch };
  });

  const select = h(
    'select',
    { class: 'picker-select', 'aria-label': t('fractal') },
    fractalId ? null : h('option', { value: '', selected: true, disabled: true }, t('chooseFractal')),
    ...FRACTALS.map((f) =>
      h('option', { value: f.id, selected: f.id === fractalId }, `${tr(f.short)} · ${tr(f.tag)}`),
    ),
  );
  select.addEventListener('change', () => onFractal(select.value as FractalId));

  const editor = createPaletteEditor(() => {
    editorOpen = false;
    sync();
  });

  function sync(): void {
    const active = currentPalette().id;
    for (const { id, button, swatch } of pills) {
      button.setAttribute('aria-pressed', String(id === active));
      swatch.style.background = gradientCss(colors(paletteById(id)));
    }
    const open = editorOpen && active === CUSTOM_ID;
    pills.at(-1)!.button.setAttribute('aria-expanded', String(open));
    editor.el.hidden = !open;
    if (open) editor.refresh();
  }
  sync();
  const unsubscribe = subscribe(sync);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && editorOpen) {
      editorOpen = false;
      sync();
    }
  };
  document.addEventListener('keydown', onKey);

  const el = h(
    'div',
    { class: 'toolbar-wrap' },
    h(
      'nav',
      { class: 'toolbar', 'aria-label': t('paletteAndFractal') },
      h('div', { class: 'pills', role: 'group', 'aria-label': t('palette') }, ...pills.map((p) => p.button)),
      h('label', { class: 'picker' }, select),
    ),
    editor.el,
  );
  return {
    el,
    destroy: () => {
      unsubscribe();
      document.removeEventListener('keydown', onKey);
    },
  };
}

/**
 * Редактор своей гаммы: от 2 до 7 опорных цветов градиента, цвет точек
 * множества и акцент. Любое изменение сразу перерисовывает карту и превью.
 */
function createPaletteEditor(onClose: () => void): { el: HTMLElement; refresh: () => void } {
  const stopsRow = h('div', { class: 'pe-stops' });
  const preview = h('div', { class: 'pe-preview', 'aria-hidden': 'true' });
  const inside = colorInput(t('insideColor'), '#000000', true);
  const accent = colorInput(t('accentColor'), '#000000', true);

  const update = (patch: Partial<PaletteColors>): void => setCustomColors({ ...customColors(), ...patch });

  inside.input.addEventListener('input', () => update({ inside: inside.input.value }));
  accent.input.addEventListener('input', () => update({ accent: accent.input.value }));

  function refresh(): void {
    const c = customColors();
    preview.style.background = gradientCss(c);
    inside.set(c.inside);
    accent.set(c.accent);
    // Пересобираем ряд, только если поменялось число цветов — иначе потеряется фокус пипетки.
    const inputs = stopsRow.querySelectorAll<HTMLInputElement>('input[type="color"]');
    if (inputs.length === c.stops.length) {
      inputs.forEach((input, i) => {
        if (input.value !== c.stops[i]) input.value = c.stops[i]!;
      });
      return;
    }
    stopsRow.replaceChildren(
      ...c.stops.map((stop, i) => {
        const field = colorInput(t('colorN', { n: i + 1 }), stop);
        field.input.addEventListener('input', () => {
          const stops = [...customColors().stops];
          stops[i] = field.input.value;
          update({ stops });
        });
        const remove = h(
          'button',
          {
            class: 'pe-remove',
            type: 'button',
            title: t('removeColor'),
            'aria-label': t('removeColorN', { n: i + 1 }),
            disabled: c.stops.length <= 2,
          },
          '×',
        );
        remove.addEventListener('click', () => update({ stops: customColors().stops.filter((_, j) => j !== i) }));
        return h('div', { class: 'pe-stop' }, field.el, remove);
      }),
      h(
        'button',
        {
          class: 'pe-add',
          type: 'button',
          title: t('addColor'),
          'aria-label': t('addColor'),
          disabled: c.stops.length >= MAX_STOPS,
          onclick: () => update({ stops: [...customColors().stops, customColors().stops.at(-1)!] }),
        },
        '+',
      ),
    );
  }

  const el = h(
    'section',
    { class: 'palette-editor', id: 'palette-editor', 'aria-label': t('customPalette'), hidden: true },
    h(
      'div',
      { class: 'pe-head' },
      h('p', { class: 'overline' }, t('customPalette')),
      h(
        'div',
        { class: 'pe-actions' },
        h('button', { class: 'pe-text-button', type: 'button', onclick: () => setCustomColors(DEFAULT_CUSTOM) }, t('reset')),
        h('button', { class: 'mini-button', type: 'button', onclick: onClose }, t('done')),
      ),
    ),
    preview,
    h(
      'div',
      { class: 'pe-body' },
      h('div', { class: 'pe-group' }, h('span', { class: 'field-label' }, t('gradientLabel')), stopsRow),
      h('div', { class: 'pe-group pe-singles' }, inside.el, accent.el),
    ),
  );
  return { el, refresh };
}

/** Пипетка цвета: квадрат в ряду градиента или квадрат с подписью для отдельных цветов. */
function colorInput(
  label: string,
  value: string,
  withLabel = false,
): { el: HTMLElement; input: HTMLInputElement; set: (v: string) => void } {
  const input = h('input', { type: 'color', class: 'pe-color', value, 'aria-label': label, title: label });
  const el = withLabel
    ? h('label', { class: 'pe-single' }, input, h('span', { class: 'field-label' }, label))
    : h('label', { class: 'pe-swatch' }, input);
  return {
    el,
    input,
    set: (v) => {
      if (input.value !== v) input.value = v;
    },
  };
}
