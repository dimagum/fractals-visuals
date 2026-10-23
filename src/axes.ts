import { minus } from './dom';
import { ceilDiv, floorDiv, fromNumber, toDecimal, toNumber, type PrecisePoint } from './precise';

/** Примерная ширина символа IBM Plex Mono при 11px. */
const CHAR_PX = 6.7;
/** Желаемое расстояние между линиями сетки, CSS px. */
const TICK_SPACING_PX = 96;

export interface Frame {
  /** Центр кадра в произвольной точности — на глубоком зуме double его не вмещает. */
  center: PrecisePoint;
  /** Единиц плоскости на CSS-пиксель. */
  unit: number;
  width: number;
  height: number;
  /** 1 — Im вверх, −1 — Im вниз. */
  flip: number;
}

export interface Tick {
  /** Позиция в CSS px от левого (для x) или верхнего (для y) края. */
  pos: number;
  /** Подпись: точное значение деления, округлённое до знаков шага. */
  label: string;
  /** Линия нуля — её сетка рисует ярче. */
  zero: boolean;
}

/** Шаг 1, 2 или 5 × 10ᵏ — как на обычных графиках. */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

export function stepDecimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/**
 * Деления по обеим осям с общим шагом — сетка остаётся квадратной. Значения
 * делений считаются в произвольной точности от точного центра: на ×10²⁰
 * соседние деления различаются в 25-м знаке, и double их бы склеил.
 */
export function computeTicks(frame: Frame): { step: number; x: Tick[]; y: Tick[] } {
  const { center, unit, width, height, flip } = frame;
  const step = niceStep(unit * TICK_SPACING_PX);
  const decimals = stepDecimals(step);
  const stepF = fromNumber(step);

  const axis = (c: bigint, halfPx: number, place: (delta: number) => number): Tick[] => {
    const half = fromNumber(halfPx * unit);
    const ticks: Tick[] = [];
    for (let k = ceilDiv(c - half, stepF); k <= floorDiv(c + half, stepF); k++) {
      const value = k * stepF;
      ticks.push({ pos: place(toNumber(value - c)), label: minus(toDecimal(value, decimals)), zero: k === 0n });
    }
    return ticks;
  };

  return {
    step,
    x: axis(center.x, width / 2, (delta) => width / 2 + delta / unit),
    y: axis(center.y, height / 2, (delta) => height / 2 - (delta * flip) / unit),
  };
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
  maxChars: number,
  axis: 'x' | 'y',
  extent: number,
): void {
  const visible = ticks.filter((t) => t.pos > 8 && t.pos < extent - 8);
  const texts = fitLabels(
    visible.map((t) => t.label),
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
    line(t.zero, () => {
      ctx.moveTo(snap(t.pos), 0);
      ctx.lineTo(snap(t.pos), height);
    });
  }
  for (const t of ticks.y) {
    line(t.zero, () => {
      ctx.moveTo(0, snap(t.pos));
      ctx.lineTo(width, snap(t.pos));
    });
  }
}
