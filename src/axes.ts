import { formatFixed } from './dom';

/** Примерная ширина символа IBM Plex Mono при 11px. */
const CHAR_PX = 6.7;
/** Желаемое расстояние между линиями сетки, CSS px. */
const TICK_SPACING_PX = 96;

export interface Frame {
  cx: number;
  cy: number;
  /** Единиц плоскости на CSS-пиксель. */
  unit: number;
  width: number;
  height: number;
  /** 1 — Im вверх, −1 — Im вниз. */
  flip: number;
}

export interface Tick {
  value: number;
  /** Позиция в CSS px от левого (для x) или верхнего (для y) края. */
  pos: number;
}

/** Шаг 1, 2 или 5 × 10ᵏ — как на обычных графиках. */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/** Деления по обеим осям с общим шагом — сетка остаётся квадратной. */
export function computeTicks(frame: Frame): { step: number; x: Tick[]; y: Tick[] } {
  const { cx, cy, unit, width, height, flip } = frame;
  const step = niceStep(unit * TICK_SPACING_PX);
  const x: Tick[] = [];
  const y: Tick[] = [];
  const halfW = (width / 2) * unit;
  const halfH = (height / 2) * unit;
  for (let k = Math.ceil((cx - halfW) / step); k <= Math.floor((cx + halfW) / step); k++) {
    const value = k * step;
    x.push({ value, pos: width / 2 + (value - cx) / unit });
  }
  for (let k = Math.ceil((cy - halfH) / step); k <= Math.floor((cy + halfH) / step); k++) {
    const value = k * step;
    y.push({ value, pos: height / 2 - ((value - cy) * flip) / unit });
  }
  return { step, x, y };
}

export function stepDecimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/**
 * Подписи, которые не влезают, теряют общий префикс: при глубоком зуме соседние
 * деления различаются только хвостом, а полный центр и так виден над картой.
 */
export function fitLabels(labels: string[], maxChars: number): string[] {
  const longest = Math.max(0, ...labels.map((l) => l.length));
  if (longest <= maxChars || labels.length === 0) return labels;
  let prefix = labels[0]!.length;
  for (const label of labels) {
    let i = 0;
    while (i < prefix && label[i] === labels[0]![i]) i++;
    prefix = i;
  }
  const cut = Math.min(prefix, longest - maxChars + 1);
  return cut > 0 ? labels.map((l) => `…${l.slice(cut)}`) : labels;
}

export function renderAxisLabels(
  container: HTMLElement,
  ticks: Tick[],
  decimals: number,
  maxChars: number,
  axis: 'x' | 'y',
  extent: number,
): void {
  const visible = ticks.filter((t) => t.pos > 8 && t.pos < extent - 8);
  const texts = fitLabels(
    visible.map((t) => formatFixed(t.value, decimals)),
    maxChars,
  );
  container.replaceChildren(
    ...visible.map((tick, i) => {
      const span = document.createElement('span');
      span.className = 'axis-label';
      span.textContent = texts[i]!;
      span.style.setProperty(axis === 'x' ? 'left' : 'top', `${tick.pos}px`);
      return span;
    }),
  );
}

export function maxCharsFor(px: number): number {
  return Math.max(4, Math.floor(px / CHAR_PX));
}

/** Линии сетки; холст сверху смешивается в режиме difference и виден на любом фоне. */
export function drawGrid(ctx: CanvasRenderingContext2D, ticks: { x: Tick[]; y: Tick[] }, dpr: number): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = Math.max(1, Math.round(dpr));
  const line = (zero: boolean, draw: () => void): void => {
    ctx.strokeStyle = zero ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    draw();
    ctx.stroke();
  };
  const snap = (v: number): number => Math.round(v * dpr) + 0.5;
  for (const t of ticks.x) {
    line(t.value === 0, () => {
      ctx.moveTo(snap(t.pos), 0);
      ctx.lineTo(snap(t.pos), height);
    });
  }
  for (const t of ticks.y) {
    line(t.value === 0, () => {
      ctx.moveTo(0, snap(t.pos));
      ctx.lineTo(width, snap(t.pos));
    });
  }
}
