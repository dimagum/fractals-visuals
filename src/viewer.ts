import { computeTicks, drawGrid, maxCharsFor, renderAxisLabels, stepDecimals, type Frame } from './axes';
import { formatFixed, formatInt, formatZoom, h } from './dom';
import { easeInOutCubic, flightPath } from './flight';
import {
  FRACTALS,
  effectiveIterations,
  parseSequence,
  type FractalDef,
  type Location,
  type View,
} from './fractals';
import { createLocationsTable, formatComplex } from './locations';
import { Renderer, needsDeep, type DrawParams } from './renderer';
import { replaceQuery } from './router';
import { colors, currentPalette, subscribe } from './store';

interface ViewerState {
  view: View;
  iterBase: number;
  density: number;
  julia: [number, number];
  sequenceText: string;
  sequence: number[];
  grid: boolean;
}

/** Бюджет кадра во время перетаскивания, мс: под него подбирается разрешение. */
const INTERACTIVE_BUDGET_MS = 14;
/** Если полный кадр дороже — рисуем его полосами за несколько кадров. */
const FULL_BUDGET_MS = 40;
const STRIP_BUDGET_MS = 24;
/** Пауза после последнего движения, после которой рисуем в полном качестве. */
const SETTLE_MS = 160;
const DENSITY_RANGE: [number, number] = [0.25, 4];
const SLIDER_MAX = 1000;
const MANDELBROT = FRACTALS[0]!;
const PICKER_VIEW: View = { cx: -0.65, cy: 0, span: 2.8 };
const MODIFIER_LABEL = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const toSlider = (v: number, [lo, hi]: [number, number]): number =>
  Math.round((Math.log(v / lo) / Math.log(hi / lo)) * SLIDER_MAX);
const fromSlider = (s: number, [lo, hi]: [number, number]): number => lo * (hi / lo) ** (s / SLIDER_MAX);

function initialState(def: FractalDef, q: URLSearchParams): ViewerState {
  const num = (key: string): number | null => {
    const raw = q.get(key);
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const span = num('s');
  const c = (q.get('c') ?? '').split(',').map(Number);
  const sequenceText = (q.get('seq') ?? def.defaultSequence ?? 'AB').toUpperCase();
  return {
    view: {
      cx: num('x') ?? def.home.cx,
      cy: num('y') ?? def.home.cy,
      span: span && span > 0 ? clamp(span, def.minSpan, def.maxSpan) : def.home.span,
    },
    iterBase: clamp(Math.round(num('it') ?? def.iterations.base), def.iterations.min, def.iterations.max),
    density: clamp(num('d') ?? 1, ...DENSITY_RANGE),
    julia:
      c.length === 2 && c.every(Number.isFinite)
        ? [c[0]!, c[1]!]
        : (def.defaultJulia ?? [0, 0]),
    sequenceText,
    sequence: parseSequence(sequenceText) ?? [0, 1],
    grid: q.get('grid') !== '0',
  };
}

/**
 * Экран интерактивной карты одного фрактала. Рисует в собственный
 * WebGL-контекст; `shared` нужен только для мини-карты выбора c у Жюлиа.
 */
export function mountViewer(root: HTMLElement, def: FractalDef, query: URLSearchParams, shared: Renderer): () => void {
  const state = initialState(def, query);
  const flip = def.flipY ? -1 : 1;
  const disposers: Array<() => void> = [];

  // ---------- Разметка ----------
  const canvas = h('canvas', { class: 'plot-canvas' });
  const gridCanvas = h('canvas', { class: 'plot-grid', 'aria-hidden': 'true' });
  const limitChip = h('span', { class: 'map-chip', hidden: true }, 'Предел точности');
  const wheelHint = h(
    'div',
    { class: 'wheel-hint', 'aria-hidden': 'true' },
    h('span', {}, `Чтобы приблизить, крутите колесо с зажатым ${MODIFIER_LABEL} или кликните по карте`),
  );
  const mapButton = (label: string, title: string, onclick: () => void): HTMLButtonElement =>
    h('button', { class: 'map-button', type: 'button', title, 'aria-label': title, onclick }, label);
  const area = h(
    'div',
    {
      class: 'plot-area',
      tabindex: '0',
      role: 'application',
      'aria-label': `Карта: ${def.name}. Стрелки — сдвиг, плюс и минус — масштаб, ноль — сброс.`,
    },
    canvas,
    gridCanvas,
    limitChip,
    wheelHint,
    h(
      'div',
      { class: 'map-buttons' },
      mapButton('+', 'Приблизить', () => zoomBy(0.5)),
      mapButton('−', 'Отдалить', () => zoomBy(2)),
      mapButton('⟲', 'Исходный вид', () => flyTo(def.home)),
    ),
  );
  const yAxis = h('div', { class: 'plot-y', 'aria-hidden': 'true' });
  const xAxis = h('div', { class: 'plot-x', 'aria-hidden': 'true' });

  const metricValue = (): HTMLDivElement => h('div', { class: 'metric-value' });
  const reValue = metricValue();
  const imValue = metricValue();
  const zoomValue = metricValue();
  const iterValue = metricValue();
  const precisionChip = h('span', { class: 'chip' });
  const metric = (label: Node[], value: HTMLElement, accent = false): HTMLElement =>
    h('div', { class: `metric${accent ? ' metric-accent' : ''}` }, h('div', { class: 'metric-label' }, ...label), value);

  const iterField = sliderField('Итерации', toSlider(state.iterBase, iterRange()), (s) => {
    state.iterBase = Math.round(fromSlider(s, iterRange()));
    iterField.output.textContent = formatInt(state.iterBase);
    requestFrame(true);
  });
  iterField.output.textContent = formatInt(state.iterBase);

  const densityField = sliderField('Плотность цвета', toSlider(state.density, DENSITY_RANGE), (s) => {
    state.density = fromSlider(s, DENSITY_RANGE);
    densityField.output.textContent = `${state.density.toFixed(2)}×`;
    requestFrame(true);
  });
  densityField.output.textContent = `${state.density.toFixed(2)}×`;

  const gridToggle = h('input', { type: 'checkbox', class: 'switch-input', checked: state.grid });
  gridToggle.addEventListener('change', () => {
    state.grid = gridToggle.checked;
    overlayDirty = true;
    requestFrame(false);
  });

  const controls = h(
    'div',
    { class: 'controls' },
    iterField.el,
    densityField.el,
    h('label', { class: 'field field-switch' }, h('span', { class: 'field-label' }, 'Сетка'), gridToggle),
  );

  let juliaPicker: ReturnType<typeof createJuliaPicker> | null = null;
  let sequenceInput: HTMLInputElement | null = null;
  if (def.id === 'julia') {
    juliaPicker = createJuliaPicker(shared, state.julia, (c) => {
      state.julia = c;
      requestFrame(true);
    });
    controls.prepend(juliaPicker.el);
  }
  if (def.id === 'lyapunov') {
    sequenceInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: state.sequenceText,
      maxlength: '16',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Последовательность из букв A и B',
    });
    const input = sequenceInput;
    input.addEventListener('input', () => {
      const seq = parseSequence(input.value);
      input.setAttribute('aria-invalid', String(!seq));
      if (!seq) return;
      state.sequenceText = input.value.trim().toUpperCase();
      state.sequence = seq;
      requestFrame(false);
    });
    controls.prepend(
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'Последовательность'),
        input,
        h('span', { class: 'field-hint' }, 'A и B, до 16 букв'),
      ),
    );
  }

  const card = h(
    'article',
    { class: 'card viewer' },
    h('p', { class: 'overline' }, `${def.overline}`),
    h('h1', { class: 'headline' }, def.name),
    h('p', { class: 'formula' }, def.formula),
    h(
      'div',
      { class: 'metrics' },
      metric([h('span', { class: 'metric-name' }, 'Центр'), h('span', { class: 'badge' }, def.axes[0])], reValue, true),
      metric([h('span', { class: 'metric-name' }, 'Центр'), h('span', { class: 'badge' }, def.axes[1])], imValue, true),
      metric([h('span', { class: 'metric-name' }, 'Увеличение')], zoomValue),
      metric([h('span', { class: 'metric-name' }, 'Итерации'), precisionChip], iterValue),
    ),
    h('div', { class: 'plot' }, yAxis, area, h('div', { class: 'plot-corner' }), xAxis),
    h('p', { class: 'hint' }, `Тяните — сдвиг · ${MODIFIER_LABEL} + колесо или щипок — масштаб · двойной клик — приблизить (Shift — отдалить)`),
    controls,
    createLocationsTable(def, (loc) => applyLocation(loc)),
  );
  root.append(card);
  document.title = `${def.name} — Атлас фракталов`;

  // ---------- Рендер ----------
  const renderer = new Renderer(canvas);
  renderer.setPalette(colors());
  const gridCtx = gridCanvas.getContext('2d')!;

  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let raf = 0;
  let interacting = false;
  let fullPending = false;
  let stripTop = 0;
  let overlayDirty = true;
  let settleTimer = 0;
  let urlTimer = 0;
  // Стоимость пикселя уточняется после каждого кадра; стартовая оценка — с запасом.
  let msPerPixel = 4e-6;

  function iterRange(): [number, number] {
    return [def.iterations.min, def.iterations.max];
  }

  function iterations(): number {
    return effectiveIterations(def, state.iterBase, state.view.span);
  }

  function drawParams(): DrawParams {
    return {
      fractal: def,
      view: state.view,
      iterations: iterations(),
      density: state.density,
      julia: state.julia,
      sequence: state.sequence,
    };
  }

  /** Запросить перерисовку: интерактивную (быстро, грубо) или финальную. */
  function requestFrame(interactive: boolean): void {
    if (interactive) {
      interacting = true;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, SETTLE_MS);
    } else {
      fullPending = true;
    }
    stripTop = 0;
    overlayDirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(syncUrl, 250);
  }

  function settle(): void {
    window.clearTimeout(settleTimer);
    interacting = false;
    requestFrame(false);
  }

  function timed(pixels: number, draw: () => void): void {
    const t0 = performance.now();
    draw();
    renderer.sync();
    const ms = performance.now() - t0;
    msPerPixel = msPerPixel * 0.4 + (ms / Math.max(1, pixels)) * 0.6;
  }

  function frame(): void {
    raf = 0;
    if (overlayDirty) updateOverlay();
    const { width, height } = canvas;
    if (!width || !height) return;
    const params = drawParams();

    if (interacting) {
      const scale = clamp(Math.sqrt(INTERACTIVE_BUDGET_MS / (msPerPixel * width * height)), 0.2, 1);
      const pixels = Math.round(width * scale) * Math.round(height * scale);
      timed(pixels, () => (scale > 0.95 ? renderer.draw(params) : renderer.drawLowRes(params, scale)));
      return;
    }

    if (fullPending) {
      fullPending = false;
      const expected = msPerPixel * width * height;
      if (expected <= FULL_BUDGET_MS) {
        timed(width * height, () => renderer.draw(params));
        return;
      }
      // Дорогой кадр: сразу грубое превью, затем полосы сверху вниз.
      renderer.drawLowRes(params, clamp(Math.sqrt(INTERACTIVE_BUDGET_MS / expected), 0.2, 1));
      stripTop = height;
      raf = requestAnimationFrame(frame);
      return;
    }

    if (stripTop > 0) {
      const rows = clamp(Math.round(STRIP_BUDGET_MS / (msPerPixel * width)), 4, stripTop);
      const y0 = stripTop - rows;
      timed(width * rows, () => renderer.draw(params, [y0, stripTop]));
      stripTop = y0;
      if (stripTop > 0) raf = requestAnimationFrame(frame);
    }
  }

  function currentFrame(): Frame {
    const { cx, cy, span } = state.view;
    return { cx, cy, unit: span / cssH, width: cssW, height: cssH, flip };
  }

  function updateOverlay(): void {
    overlayDirty = false;
    if (!cssW || !cssH) return;
    const f = currentFrame();
    const ticks = computeTicks(f);
    const decimals = stepDecimals(ticks.step);
    renderAxisLabels(yAxis, ticks.y, decimals, maxCharsFor(yAxis.clientWidth - 10), 'y', cssH);
    renderAxisLabels(xAxis, ticks.x, decimals, maxCharsFor(ticks.step / f.unit - 14), 'x', cssW);
    if (state.grid) drawGrid(gridCtx, ticks, dpr);
    else gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

    const centerDecimals = clamp(Math.ceil(-Math.log10(f.unit)), 2, 16);
    reValue.textContent = formatFixed(state.view.cx, centerDecimals);
    imValue.textContent = formatFixed(state.view.cy, centerDecimals);
    zoomValue.textContent = formatZoom(def.home.span / state.view.span);
    iterValue.textContent = formatInt(iterations());
    const deep = needsDeep(def, state.view, canvas.height || cssH);
    precisionChip.textContent = deep ? 'df64' : 'fp32';
    precisionChip.title = deep
      ? 'Эмуляция double: две float32 на координату'
      : 'Обычная одинарная точность GPU';
    limitChip.hidden = state.view.span > def.minSpan * 1.001;
  }

  function resize(): void {
    const rect = area.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, gridCanvas]) {
      c.width = Math.max(1, Math.round(cssW * dpr));
      c.height = Math.max(1, Math.round(cssH * dpr));
    }
    requestFrame(false);
  }

  // ---------- Навигация ----------
  function toPlane(px: number, py: number): [number, number] {
    const unit = state.view.span / cssH;
    return [state.view.cx + (px - cssW / 2) * unit, state.view.cy + (cssH / 2 - py) * unit * flip];
  }

  function zoomedView(px: number, py: number, factor: number): View {
    const [x, y] = toPlane(px, py);
    const span = clamp(state.view.span * factor, def.minSpan, def.maxSpan);
    const unit = span / cssH;
    return { cx: x - (px - cssW / 2) * unit, cy: y - (cssH / 2 - py) * unit * flip, span };
  }

  function pan(dx: number, dy: number): void {
    const unit = state.view.span / cssH;
    state.view = { ...state.view, cx: state.view.cx - dx * unit, cy: state.view.cy + dy * unit * flip };
  }

  let flight = 0;
  function stopFlight(): void {
    cancelAnimationFrame(flight);
    flight = 0;
  }

  function flyTo(target: View, maxMs = 2800): void {
    stopFlight();
    const path = flightPath(state.view, target);
    const duration = clamp(Math.abs(path.length) * 300, 250, maxMs);
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      state.view = t < 1 ? path.at(easeInOutCubic(t)) : { ...target };
      if (t < 1) {
        requestFrame(true);
        flight = requestAnimationFrame(step);
      } else {
        flight = 0;
        settle();
      }
    };
    flight = requestAnimationFrame(step);
  }

  function zoomBy(factor: number): void {
    flyTo(zoomedView(cssW / 2, cssH / 2, factor), 400);
  }

  function applyLocation(loc: Location): void {
    if (loc.julia) {
      state.julia = loc.julia;
      juliaPicker?.set(loc.julia);
    }
    if (loc.sequence) {
      const seq = parseSequence(loc.sequence);
      if (seq) {
        state.sequence = seq;
        state.sequenceText = loc.sequence;
        if (sequenceInput) sequenceInput.value = loc.sequence;
      }
    }
    flyTo(loc.view);
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const pointers = new Map<number, { x: number; y: number }>();
  const local = (e: PointerEvent | MouseEvent | WheelEvent): { x: number; y: number } => {
    const rect = area.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Колесо без модификатора прокручивает страницу. Клик по карте «включает» её:
  // пока курсор над ней, колесо зумит; увёл курсор — карта снова пропускает прокрутку.
  let wheelArmed = false;
  let hintTimer = 0;
  let lastPageScroll = 0;

  // Если страницу только что прокручивали, карта просто «проехала» под курсором —
  // подсказку не показываем, чтобы она не мигала при обычной прокрутке.
  const onPageScroll = (): void => {
    lastPageScroll = performance.now();
  };
  window.addEventListener('scroll', onPageScroll, { passive: true });
  disposers.push(() => window.removeEventListener('scroll', onPageScroll));

  const showWheelHint = (): void => {
    if (performance.now() - lastPageScroll < 350) return;
    wheelHint.classList.add('is-visible');
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => wheelHint.classList.remove('is-visible'), 1400);
  };

  const hideWheelHint = (): void => {
    window.clearTimeout(hintTimer);
    wheelHint.classList.remove('is-visible');
  };

  area.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') wheelArmed = false;
  });

  area.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    wheelArmed = true;
    hideWheelHint();
    stopFlight();
    area.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    area.classList.add('is-dragging');
  });

  area.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    if (pointers.size === 1) {
      pan(cur.x - prev.x, cur.y - prev.y);
    } else {
      // Щипок двумя пальцами: сдвиг по середине и масштаб по расстоянию.
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(cur.x - other.x, cur.y - other.y);
        pan((cur.x - prev.x) / 2, (cur.y - prev.y) / 2);
        if (before > 0 && after > 0) {
          state.view = zoomedView((cur.x + other.x) / 2, (cur.y + other.y) / 2, before / after);
        }
      }
    }
    pointers.set(e.pointerId, cur);
    requestFrame(true);
  });

  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (!pointers.size) area.classList.remove('is-dragging');
  };
  area.addEventListener('pointerup', release);
  area.addEventListener('pointercancel', release);

  area.addEventListener(
    'wheel',
    (e) => {
      // Щипок на тачпаде браузер присылает как wheel с ctrlKey — он зумит всегда.
      if (!wheelArmed && !e.ctrlKey && !e.metaKey) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) showWheelHint();
        return;
      }
      e.preventDefault();
      hideWheelHint();
      stopFlight();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cssH : 1);
      // Мелкие дельты — тачпад (щипок, прокрутка двумя пальцами), крупные — щелчки колеса мыши.
      const speed = Math.abs(delta) < 40 ? 0.01 : 0.002;
      const { x, y } = local(e);
      state.view = zoomedView(x, y, Math.exp(clamp(delta * speed, -0.7, 0.7)));
      requestFrame(true);
    },
    { passive: false },
  );

  area.addEventListener('dblclick', (e) => {
    const { x, y } = local(e);
    flyTo(zoomedView(x, y, e.shiftKey ? 2 : 0.5), 450);
  });

  area.addEventListener('keydown', (e) => {
    const stepX = cssW * 0.1;
    const stepY = cssH * 0.1;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => flyTo({ ...state.view, ...offset(-stepX, 0) }, 200),
      ArrowRight: () => flyTo({ ...state.view, ...offset(stepX, 0) }, 200),
      ArrowUp: () => flyTo({ ...state.view, ...offset(0, -stepY) }, 200),
      ArrowDown: () => flyTo({ ...state.view, ...offset(0, stepY) }, 200),
      '+': () => zoomBy(0.5),
      '=': () => zoomBy(0.5),
      '-': () => zoomBy(2),
      '0': () => flyTo(def.home),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  });

  /** Центр после сдвига камеры на (dx, dy) CSS-пикселей. */
  function offset(dx: number, dy: number): { cx: number; cy: number } {
    const [cx, cy] = toPlane(cssW / 2 + dx, cssH / 2 + dy);
    return { cx, cy };
  }

  // ---------- Адрес ----------
  function syncUrl(): void {
    const q = new URLSearchParams();
    const decimals = clamp(Math.ceil(-Math.log10(state.view.span)) + 5, 4, 18);
    q.set('x', String(Number(state.view.cx.toFixed(decimals))));
    q.set('y', String(Number(state.view.cy.toFixed(decimals))));
    q.set('s', state.view.span.toPrecision(4));
    if (state.iterBase !== def.iterations.base) q.set('it', String(state.iterBase));
    if (Math.abs(state.density - 1) > 0.005) q.set('d', state.density.toFixed(2));
    if (def.id === 'julia') q.set('c', state.julia.map((v) => Number(v.toFixed(6))).join(','));
    if (def.id === 'lyapunov') q.set('seq', state.sequenceText);
    if (!state.grid) q.set('grid', '0');
    q.set('p', currentPalette().id);
    replaceQuery(def.id, q);
  }

  // ---------- Подписки ----------
  const observer = new ResizeObserver(resize);
  observer.observe(area);
  disposers.push(() => observer.disconnect());

  disposers.push(
    subscribe(() => {
      renderer.setPalette(colors());
      juliaPicker?.redraw();
      requestFrame(false);
    }),
  );

  const onDprChange = (): void => resize();
  const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', onDprChange);
  disposers.push(() => dprQuery.removeEventListener('change', onDprChange));

  resize();

  return () => {
    stopFlight();
    cancelAnimationFrame(raf);
    window.clearTimeout(hintTimer);
    window.clearTimeout(settleTimer);
    window.clearTimeout(urlTimer);
    disposers.forEach((dispose) => dispose());
    renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
}

function sliderField(
  label: string,
  value: number,
  onInput: (value: number) => void,
): { el: HTMLElement; output: HTMLOutputElement } {
  const input = h('input', { type: 'range', class: 'slider', min: '0', max: String(SLIDER_MAX), value: String(value) });
  const output = h('output', { class: 'field-value' });
  input.addEventListener('input', () => onInput(Number(input.value)));
  const el = h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label, output),
    input,
  );
  return { el, output };
}

/**
 * Мини-карта Мандельброта для выбора c: каждая точка множества Мандельброта
 * соответствует связному множеству Жюлиа, точки снаружи — «пыли Фату».
 */
function createJuliaPicker(
  shared: Renderer,
  initial: [number, number],
  onChange: (c: [number, number]) => void,
): { el: HTMLElement; set: (c: [number, number]) => void; redraw: () => void } {
  const canvas = h('canvas', { class: 'cpicker-canvas', 'aria-hidden': 'true' });
  const marker = h('span', { class: 'cpicker-marker' });
  const value = h('output', { class: 'field-value' });
  const box = h(
    'div',
    { class: 'cpicker', role: 'slider', tabindex: '0', 'aria-label': 'Параметр c на множестве Мандельброта' },
    canvas,
    marker,
  );
  let c = initial;

  const place = (): void => {
    const size = box.clientWidth || 1;
    const unit = PICKER_VIEW.span / size;
    marker.style.left = `${size / 2 + (c[0] - PICKER_VIEW.cx) / unit}px`;
    marker.style.top = `${size / 2 - (c[1] - PICKER_VIEW.cy) / unit}px`;
    value.textContent = formatComplex(c);
    box.setAttribute('aria-valuetext', `c = ${formatComplex(c)}`);
  };

  const redraw = (): void => {
    const size = Math.round((box.clientWidth || 160) * Math.min(window.devicePixelRatio || 1, 2));
    shared.setPalette(colors());
    shared.canvas.width = size;
    shared.canvas.height = size;
    shared.draw({
      fractal: MANDELBROT,
      view: PICKER_VIEW,
      iterations: 120,
      density: 1,
      julia: [0, 0],
      sequence: [0, 1],
    });
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')?.drawImage(shared.canvas, 0, 0);
    place();
  };

  const pick = (e: PointerEvent): void => {
    const rect = box.getBoundingClientRect();
    const unit = PICKER_VIEW.span / rect.width;
    c = [
      clamp(PICKER_VIEW.cx + (e.clientX - rect.left - rect.width / 2) * unit, -2, 2),
      clamp(PICKER_VIEW.cy - (e.clientY - rect.top - rect.height / 2) * unit, -2, 2),
    ];
    place();
    onChange(c);
  };

  box.addEventListener('pointerdown', (e) => {
    box.setPointerCapture(e.pointerId);
    pick(e);
  });
  box.addEventListener('pointermove', (e) => {
    if (box.hasPointerCapture(e.pointerId)) pick(e);
  });
  box.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.001 : 0.01;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    c = [c[0] + d[0], c[1] + d[1]];
    place();
    onChange(c);
  });

  requestAnimationFrame(redraw);

  const el = h(
    'div',
    { class: 'field field-c' },
    h('span', { class: 'field-label' }, 'Параметр c', value),
    box,
  );
  return {
    el,
    set: (next) => {
      c = next;
      place();
    },
    redraw,
  };
}
