import { computeTicks, drawGrid, maxCharsFor, renderAxisLabels, type Frame } from './axes';
import { formatFixed, formatInt, formatZoom, h, minus } from './dom';
import { EXPORT_SIZES, downloadBlob, exportDimensions, renderPng, type ExportJob, type ExportSize } from './export';
import { easeInOutCubic, flightPath } from './flight';
import {
  FRACTALS,
  POWER_RANGE,
  defaultParams,
  effectiveIterations,
  formulaText,
  minSpanFor,
  parseSequence,
  type FractalDef,
  type FractalParams,
  type Location,
  type View,
} from './fractals';
import { createExplanation } from './explanation';
import { createLocationsTable, formatComplex } from './locations';
import { NEWTON_POLYNOMIALS, findPolynomial } from './polynomial';
import { ReferenceManager } from './perturb';
import {
  difference,
  fromDecimal,
  fromNumber,
  offsetPoint,
  pointFromNumbers,
  toDecimal,
  toNumber,
  type PrecisePoint,
} from './precise';
import { Renderer, drawParamsFor, precisionMode, wantsPerturb, type DrawParams } from './renderer';
import { replaceQuery } from './router';
import { colors, subscribe, writePaletteQuery } from './store';
import { t, tr } from './i18n';

interface ViewerState {
  /** Приближённый вид в double: для осей, масштаба и всего, где хватает 16 знаков. */
  view: View;
  /** Точный центр — источник истины; view.cx и view.cy — его округления. */
  center: PrecisePoint;
  iterBase: number;
  density: number;
  params: FractalParams;
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
const PHOENIX_RANGE: [number, number] = [-1.2, 1.2];
/** Мини-карта c: для d = 2 смещена влево к телу Мандельброта, для d > 2 множество симметрично. */
const pickerView = (power: number): View =>
  power === 2 ? { cx: -0.65, cy: 0, span: 2.8 } : { cx: 0, cy: 0, span: 2.8 };
const MODIFIER_LABEL = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Куда лететь камере: точный центр и высота кадра. */
interface Target {
  center: PrecisePoint;
  span: number;
}

/** «-0.743000» → «-0.743»: хвостовые нули в адресе ни к чему. */
const trimDecimal = (text: string): string => (text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text);
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
  const params = defaultParams(def);
  const pair = (q.get(def.controls.includes('phoenix') ? 'pq' : 'c') ?? '').split(',').map(Number);
  if (pair.length === 2 && pair.every(Number.isFinite)) params.param = [pair[0]!, pair[1]!];
  const power = num('pow');
  if (power !== null) params.power = clamp(Math.round(power), ...POWER_RANGE);
  const sequence = q.get('seq')?.toUpperCase();
  if (sequence && parseSequence(sequence)) params.sequence = sequence;
  const poly = q.get('poly');
  if (poly && NEWTON_POLYNOMIALS.some((p) => p.id === poly)) params.poly = poly;
  const center: PrecisePoint = {
    x: fromDecimal(q.get('x') ?? '') ?? fromNumber(def.home.cx),
    y: fromDecimal(q.get('y') ?? '') ?? fromNumber(def.home.cy),
  };
  return {
    view: {
      cx: toNumber(center.x),
      cy: toNumber(center.y),
      span: span && span > 0 ? clamp(span, minSpanFor(def, params.power), def.maxSpan) : def.home.span,
    },
    center,
    iterBase: clamp(Math.round(num('it') ?? def.iterations.base), def.iterations.min, def.iterations.max),
    density: clamp(num('d') ?? 1, ...DENSITY_RANGE),
    params,
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
  const limitChip = h('span', { class: 'map-chip', hidden: true }, t('precisionLimit'));
  const wheelHint = h(
    'div',
    { class: 'wheel-hint', 'aria-hidden': 'true' },
    h('span', {}, t('wheelHint', { mod: MODIFIER_LABEL })),
  );
  const mapButton = (label: string, title: string, onclick: () => void): HTMLButtonElement =>
    h('button', { class: 'map-button', type: 'button', title, 'aria-label': title, onclick }, label);
  const area = h(
    'div',
    {
      class: 'plot-area',
      tabindex: '0',
      role: 'application',
      'aria-label': t('mapLabel', { name: tr(def.name) }),
    },
    canvas,
    gridCanvas,
    limitChip,
    wheelHint,
    h(
      'div',
      { class: 'map-buttons' },
      mapButton('+', t('zoomIn'), () => zoomBy(0.5)),
      mapButton('−', t('zoomOut'), () => zoomBy(2)),
      mapButton('⟲', t('homeView'), () => flyTo(homeView())),
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

  const iterField = sliderField(t('iterations'), toSlider(state.iterBase, iterRange()), (s) => {
    state.iterBase = Math.round(fromSlider(s, iterRange()));
    iterField.output.textContent = formatInt(state.iterBase);
    requestFrame(true);
  });
  iterField.output.textContent = formatInt(state.iterBase);

  const densityField = sliderField(t('colorDensity'), toSlider(state.density, DENSITY_RANGE), (s) => {
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

  const exportSelect = h(
    'select',
    { class: 'mini-select', 'aria-label': t('exportSize') },
    ...EXPORT_SIZES.map((size) => h('option', { value: size.id }, size.label())),
  );
  const exportButton = h('button', { class: 'mini-button', type: 'button' }, t('downloadPng'));
  let exportJob: ExportJob | null = null;
  exportButton.addEventListener('click', () => void runExport());

  const controls = h(
    'div',
    { class: 'controls' },
    iterField.el,
    densityField.el,
    h('label', { class: 'field field-switch' }, h('span', { class: 'field-label' }, t('grid')), gridToggle),
    h(
      'div',
      { class: 'field field-export' },
      h('span', { class: 'field-label' }, t('export')),
      h('div', { class: 'field-row' }, exportSelect, exportButton),
    ),
  );

  const has = (control: FractalDef['controls'][number]): boolean => def.controls.includes(control);
  const setParams = (patch: Partial<FractalParams>): void => {
    state.params = { ...state.params, ...patch };
  };
  const formulaEl = h('p', { class: 'formula' });
  const updateFormula = (): void => {
    formulaEl.textContent = formulaText(def, state.params);
  };
  updateFormula();

  // Ручки параметров — только те, что есть у этого фрактала.
  const paramFields: HTMLElement[] = [];
  let juliaPicker: ReturnType<typeof createJuliaPicker> | null = null;
  let powerGroup: ReturnType<typeof segmentedField> | null = null;
  let polySelect: HTMLSelectElement | null = null;
  let sequenceInput: HTMLInputElement | null = null;
  const phoenixFields: ReturnType<typeof linearField>[] = [];

  if (has('julia')) {
    juliaPicker = createJuliaPicker(shared, () => state.params.power, state.params.param, (c) => {
      setParams({ param: c });
      requestFrame(true);
    });
    paramFields.push(juliaPicker.el);
  }

  if (has('power')) {
    const powers = Array.from({ length: POWER_RANGE[1] - POWER_RANGE[0] + 1 }, (_, i) => POWER_RANGE[0] + i);
    powerGroup = segmentedField(t('power'), powers, state.params.power, (power) => {
      setParams({ power });
      updateFormula();
      juliaPicker?.redraw();
      // На обзорном масштабе центрируем: при d ≥ 3 множество симметрично относительно нуля,
      // а исходный вид смещён под тело обычного Мандельброта. Приближенный вид не трогаем.
      // Глубже предела df64 для d ≠ 2 возмущения не работают — тогда тоже возвращаемся.
      if (state.view.span >= def.home.span / 1.5 || state.view.span < minSpanFor(def, power)) flyTo(homeView());
      else requestFrame(false);
    });
    paramFields.push(powerGroup.el);
  }

  if (has('phoenix')) {
    (['p', 'q'] as const).forEach((name, i) => {
      const field = linearField(name, PHOENIX_RANGE, state.params.param[i]!, (v) => {
        const param: [number, number] = [...state.params.param];
        param[i] = v;
        setParams({ param });
        requestFrame(true);
      });
      phoenixFields.push(field);
      paramFields.push(field.el);
    });
  }

  if (has('poly')) {
    const select = h(
      'select',
      { class: 'mini-select', 'aria-label': t('polynomial') },
      ...NEWTON_POLYNOMIALS.map((poly) => h('option', { value: poly.id, selected: poly.id === state.params.poly }, poly.label)),
    );
    select.addEventListener('change', () => {
      setParams({ poly: select.value });
      updateFormula();
      flyTo({ center: pointFromNumbers(0, 0), span: findPolynomial(select.value).span });
    });
    polySelect = select;
    paramFields.push(h('label', { class: 'field field-poly' }, h('span', { class: 'field-label' }, t('polynomial')), select));
  }

  if (has('sequence')) {
    const input = h('input', {
      class: 'text-input',
      type: 'text',
      value: state.params.sequence,
      maxlength: '16',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': t('sequenceLabel'),
    });
    input.addEventListener('input', () => {
      const valid = parseSequence(input.value) !== null;
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid) return;
      setParams({ sequence: input.value.trim().toUpperCase() });
      requestFrame(false);
    });
    sequenceInput = input;
    paramFields.push(
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, t('sequence')),
        input,
        h('span', { class: 'field-hint' }, t('sequenceHint')),
      ),
    );
  }
  controls.prepend(...paramFields);

  /** Исходный вид с учётом степени: для d > 2 — по центру. */
  function homeView(): Target {
    const centered = has('power') && state.params.power !== 2;
    return {
      center: centered ? pointFromNumbers(0, 0) : pointFromNumbers(def.home.cx, def.home.cy),
      span: def.home.span,
    };
  }

  /** Подтягивает все ручки к state.params — после клика по известному месту. */
  function syncControls(): void {
    const { power, param, poly, sequence } = state.params;
    juliaPicker?.set(param);
    juliaPicker?.redraw();
    powerGroup?.set(power);
    phoenixFields.forEach((field, i) => field.set(param[i]!));
    if (polySelect) polySelect.value = poly;
    if (sequenceInput) sequenceInput.value = sequence;
    updateFormula();
  }

  const explanation = createExplanation(
    def,
    () => state.params,
    () => state.view,
    () => iterations(),
  );

  const card = h(
    'article',
    { class: 'card viewer' },
    h('p', { class: 'overline' }, tr(def.overline)),
    h('h1', { class: 'headline' }, tr(def.name)),
    formulaEl,
    h(
      'div',
      { class: 'metrics' },
      metric([h('span', { class: 'metric-name' }, t('center')), h('span', { class: 'badge' }, def.axes[0])], reValue, true),
      metric([h('span', { class: 'metric-name' }, t('center')), h('span', { class: 'badge' }, def.axes[1])], imValue, true),
      metric([h('span', { class: 'metric-name' }, t('zoom'))], zoomValue),
      metric([h('span', { class: 'metric-name' }, t('iterations')), precisionChip], iterValue),
    ),
    h('div', { class: 'plot' }, yAxis, area, h('div', { class: 'plot-corner' }), xAxis),
    h('p', { class: 'hint' }, t('navHint', { mod: MODIFIER_LABEL })),
    controls,
    createLocationsTable(def, (loc) => applyLocation(loc)),
    explanation.el,
  );
  root.append(card);
  document.title = `${tr(def.name)} — ${t('siteName')}`;

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

  /** Рендерит текущий вид в PNG; повторный клик во время рендера отменяет его. */
  async function runExport(): Promise<void> {
    if (exportJob) {
      exportJob.cancelled = true;
      return;
    }
    const job: ExportJob = { cancelled: false };
    exportJob = job;
    const [width, height] = exportDimensions(
      exportSelect.value as ExportSize,
      [canvas.width, canvas.height],
      cssW / cssH,
    );
    const params = { ...drawParams(), view: { ...state.view } };
    const setLabel = (fraction: number): void => {
      exportButton.textContent = t('exportCancel', { percent: Math.round(fraction * 100) });
    };
    setLabel(0);
    exportButton.classList.add('is-busy');
    try {
      const blob = await renderPng(params, colors(), width, height, job, setLabel);
      if (blob) downloadBlob(blob, exportFilename(params.view, width, height));
    } catch (err) {
      console.error(err);
      window.alert(t('exportFailed'));
    } finally {
      exportJob = null;
      exportButton.textContent = t('downloadPng');
      exportButton.classList.remove('is-busy');
    }
  }

  function exportFilename(view: View, width: number, height: number): string {
    const zoom = def.home.span / view.span;
    const zoomTag = zoom < 1e5 ? String(Math.round(zoom)) : zoom.toExponential(1).replace('+', '');
    return `${def.id}-x${zoomTag}-${width}x${height}.png`;
  }

  function iterRange(): [number, number] {
    return [def.iterations.min, def.iterations.max];
  }

  function iterations(): number {
    return effectiveIterations(def, state.iterBase, state.view.span);
  }

  // Опорные орбиты для теории возмущений; готовая орбита сразу перерисовывает кадр.
  const references = new ReferenceManager(() => requestFrame(false));
  disposers.push(() => references.dispose());

  function drawParams(): DrawParams {
    const params = drawParamsFor(def, state.view, state.params, state.iterBase, state.density);
    if (wantsPerturb(def, state.view, params.power)) {
      const julia = def.id === 'julia';
      const orbit = references.get({
        kind: julia ? 'julia' : 'mandelbrot',
        center: state.center,
        param: julia ? pointFromNumbers(...state.params.param) : pointFromNumbers(0, 0),
        span: state.view.span,
        iterations: params.iterations,
      });
      params.perturb = orbit ? { orbit, offset: difference(state.center, orbit.center) } : null;
    }
    return params;
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
    return { center: state.center, unit: state.view.span / cssH, width: cssW, height: cssH, flip };
  }

  function updateOverlay(): void {
    overlayDirty = false;
    if (!cssW || !cssH) return;
    const f = currentFrame();
    const ticks = computeTicks(f);
    renderAxisLabels(yAxis, ticks.y, maxCharsFor(yAxis.clientWidth - 10), 'y', cssH);
    renderAxisLabels(xAxis, ticks.x, maxCharsFor(ticks.step / f.unit - 14), 'x', cssW);
    if (state.grid) drawGrid(gridCtx, ticks, dpr);
    else gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

    // Ровно столько знаков, чтобы различать соседние пиксели; на глубоком зуме — десятки.
    const centerDecimals = clamp(Math.ceil(-Math.log10(f.unit)), 2, 40);
    reValue.textContent = minus(toDecimal(state.center.x, centerDecimals));
    imValue.textContent = minus(toDecimal(state.center.y, centerDecimals));
    zoomValue.textContent = formatZoom(def.home.span / state.view.span);
    iterValue.textContent = formatInt(iterations());
    const params = drawParams();
    const mode = precisionMode(params, canvas.height || cssH);
    const waiting = params.perturb === null;
    precisionChip.textContent = waiting ? 'ptb…' : mode;
    precisionChip.title = waiting
      ? t('precisionPtbWaiting')
      : t(mode === 'ptb' ? 'precisionPtb' : mode === 'df64' ? 'precisionDf64' : 'precisionFp32');
    limitChip.hidden = state.view.span > minSpanFor(def, state.params.power) * 1.001;
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
  // Все движения — это сдвиги точного центра на небольшие double-смещения:
  // так на любой глубине пиксель сдвига не теряется в округлении.
  function setCenter(center: PrecisePoint, span = state.view.span): void {
    state.center = center;
    state.view = { cx: toNumber(center.x), cy: toNumber(center.y), span };
  }

  /** Вид после зума с коэффициентом factor вокруг точки (px, py) экрана: она остаётся под курсором. */
  function zoomTarget(px: number, py: number, factor: number): Target {
    const span = clamp(state.view.span * factor, minSpanFor(def, state.params.power), def.maxSpan);
    const shift = (state.view.span - span) / cssH;
    return {
      center: offsetPoint(state.center, (px - cssW / 2) * shift, (cssH / 2 - py) * shift * flip),
      span,
    };
  }

  function pan(dx: number, dy: number): void {
    const unit = state.view.span / cssH;
    setCenter(offsetPoint(state.center, -dx * unit, dy * unit * flip));
  }

  let flight = 0;
  function stopFlight(): void {
    cancelAnimationFrame(flight);
    flight = 0;
  }

  /**
   * Перелёт считается в координатах относительно стартовой точки: разность
   * центров берётся точно и только потом сводится к double, поэтому траектория
   * ван Вейка корректна даже между точками, неразличимыми в double.
   */
  function flyTo(target: Target, maxMs = 2800): void {
    stopFlight();
    const from = state.center;
    const [dx, dy] = difference(target.center, from);
    const path = flightPath({ cx: 0, cy: 0, span: state.view.span }, { cx: dx, cy: dy, span: target.span });
    const duration = clamp(Math.abs(path.length) * 300, 250, maxMs);
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      if (t < 1) {
        const v = path.at(easeInOutCubic(t));
        setCenter(offsetPoint(from, v.cx, v.cy), v.span);
        requestFrame(true);
        flight = requestAnimationFrame(step);
      } else {
        setCenter(target.center, target.span);
        flight = 0;
        settle();
      }
    };
    flight = requestAnimationFrame(step);
  }

  function zoomBy(factor: number): void {
    flyTo(zoomTarget(cssW / 2, cssH / 2, factor), 400);
  }

  function applyLocation(loc: Location): void {
    // Место без явной степени или многочлена задано для значений по умолчанию.
    const defaults = defaultParams(def);
    setParams({
      param: loc.param ?? state.params.param,
      sequence: loc.sequence && parseSequence(loc.sequence) ? loc.sequence : state.params.sequence,
      power: loc.power ?? defaults.power,
      poly: loc.poly ?? defaults.poly,
    });
    syncControls();
    const precise = loc.precise && { x: fromDecimal(loc.precise.x), y: fromDecimal(loc.precise.y) };
    flyTo({
      center: precise?.x != null && precise.y != null ? { x: precise.x, y: precise.y } : pointFromNumbers(loc.view.cx, loc.view.cy),
      span: Math.max(loc.view.span, minSpanFor(def, state.params.power)),
    });
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
          const target = zoomTarget((cur.x + other.x) / 2, (cur.y + other.y) / 2, before / after);
          setCenter(target.center, target.span);
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
      const target = zoomTarget(x, y, Math.exp(clamp(delta * speed, -0.7, 0.7)));
      setCenter(target.center, target.span);
      requestFrame(true);
    },
    { passive: false },
  );

  area.addEventListener('dblclick', (e) => {
    const { x, y } = local(e);
    flyTo(zoomTarget(x, y, e.shiftKey ? 2 : 0.5), 450);
  });

  area.addEventListener('keydown', (e) => {
    // Шаг стрелки — десятая часть кадра.
    const stepX = state.view.span * (cssW / cssH) * 0.1;
    const stepY = state.view.span * 0.1 * flip;
    const shiftBy = (dx: number, dy: number): Target => ({ center: offsetPoint(state.center, dx, dy), span: state.view.span });
    const actions: Record<string, () => void> = {
      ArrowLeft: () => flyTo(shiftBy(-stepX, 0), 200),
      ArrowRight: () => flyTo(shiftBy(stepX, 0), 200),
      ArrowUp: () => flyTo(shiftBy(0, stepY), 200),
      ArrowDown: () => flyTo(shiftBy(0, -stepY), 200),
      '+': () => zoomBy(0.5),
      '=': () => zoomBy(0.5),
      '-': () => zoomBy(2),
      '0': () => flyTo(homeView()),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  });

  // ---------- Адрес ----------
  function syncUrl(): void {
    const q = new URLSearchParams();
    // Координаты пишем десятичной строкой нужной длины — на глубоком зуме это 35+ знаков.
    const decimals = clamp(Math.ceil(-Math.log10(state.view.span)) + 5, 4, 60);
    q.set('x', trimDecimal(toDecimal(state.center.x, decimals)));
    q.set('y', trimDecimal(toDecimal(state.center.y, decimals)));
    q.set('s', state.view.span.toPrecision(4));
    if (state.iterBase !== def.iterations.base) q.set('it', String(state.iterBase));
    if (Math.abs(state.density - 1) > 0.005) q.set('d', state.density.toFixed(2));
    const pair = state.params.param.map((v) => Number(v.toFixed(6))).join(',');
    if (has('julia')) q.set('c', pair);
    if (has('phoenix')) q.set('pq', pair);
    if (has('power') && state.params.power !== 2) q.set('pow', String(state.params.power));
    if (has('poly')) q.set('poly', state.params.poly);
    if (has('sequence')) q.set('seq', state.params.sequence);
    if (!state.grid) q.set('grid', '0');
    replaceQuery(def.id, writePaletteQuery(q));
    // Разбор внизу страницы следует за параметрами и центром карты; адрес
    // обновляется с той же задержкой, так что пересчёт не идёт на каждый кадр.
    explanation.update();
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
    if (exportJob) exportJob.cancelled = true;
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

/** Ползунок с линейной шкалой и числом справа — для p и q Феникса. */
function linearField(
  label: string,
  [lo, hi]: [number, number],
  value: number,
  onInput: (value: number) => void,
): { el: HTMLElement; set: (value: number) => void } {
  const toPos = (v: number): number => Math.round(((v - lo) / (hi - lo)) * SLIDER_MAX);
  const show = (v: number): void => {
    field.output.textContent = formatFixed(v, 3);
  };
  const field = sliderField(label, toPos(value), (pos) => {
    const v = lo + ((hi - lo) * pos) / SLIDER_MAX;
    show(v);
    onInput(v);
  });
  show(value);
  return {
    el: field.el,
    set: (v) => {
      field.el.querySelector('input')!.value = String(toPos(v));
      show(v);
    },
  };
}

/** Ряд кнопок-таблеток для небольшого набора значений, как вкладки над графиком. */
function segmentedField(
  label: string,
  options: number[],
  value: number,
  onChange: (value: number) => void,
): { el: HTMLElement; set: (value: number) => void } {
  const buttons = options.map((option) =>
    h('button', { class: 'seg', type: 'button', 'aria-pressed': String(option === value) }, String(option)),
  );
  const set = (next: number): void => {
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i] === next)));
  };
  buttons.forEach((button, i) =>
    button.addEventListener('click', () => {
      set(options[i]!);
      onChange(options[i]!);
    }),
  );
  const el = h(
    'div',
    { class: 'field field-seg' },
    h('span', { class: 'field-label' }, label),
    h('div', { class: 'segmented', role: 'group', 'aria-label': label }, ...buttons),
  );
  return { el, set };
}

/**
 * Мини-карта Мандельброта для выбора c: каждая точка множества Мандельброта
 * соответствует связному множеству Жюлиа, точки снаружи — «пыли Фату».
 */
function createJuliaPicker(
  shared: Renderer,
  getPower: () => number,
  initial: [number, number],
  onChange: (c: [number, number]) => void,
): { el: HTMLElement; set: (c: [number, number]) => void; redraw: () => void } {
  const canvas = h('canvas', { class: 'cpicker-canvas', 'aria-hidden': 'true' });
  const marker = h('span', { class: 'cpicker-marker' });
  const value = h('output', { class: 'field-value' });
  const box = h(
    'div',
    { class: 'cpicker', role: 'slider', tabindex: '0', 'aria-label': t('juliaPicker') },
    canvas,
    marker,
  );
  let c = initial;

  const place = (): void => {
    const size = box.clientWidth || 1;
    const view = pickerView(getPower());
    const unit = view.span / size;
    marker.style.left = `${size / 2 + (c[0] - view.cx) / unit}px`;
    marker.style.top = `${size / 2 - (c[1] - view.cy) / unit}px`;
    value.textContent = formatComplex(c);
    box.setAttribute('aria-valuetext', `c = ${formatComplex(c)}`);
  };

  const redraw = (): void => {
    const size = Math.round((box.clientWidth || 160) * Math.min(window.devicePixelRatio || 1, 2));
    shared.setPalette(colors());
    shared.canvas.width = size;
    shared.canvas.height = size;
    const power = getPower();
    shared.draw(drawParamsFor(MANDELBROT, pickerView(power), { ...defaultParams(MANDELBROT), power }, 120, 1));
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')?.drawImage(shared.canvas, 0, 0);
    place();
  };

  const pick = (e: PointerEvent): void => {
    const rect = box.getBoundingClientRect();
    const view = pickerView(getPower());
    const unit = view.span / rect.width;
    c = [
      clamp(view.cx + (e.clientX - rect.left - rect.width / 2) * unit, -2, 2),
      clamp(view.cy - (e.clientY - rect.top - rect.height / 2) * unit, -2, 2),
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
    h('span', { class: 'field-label' }, t('juliaParam'), value),
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
