import { difference, type PrecisePoint } from './precise';
import { bitsFor, computeReference, type ReferenceKind, type ReferenceOrbit, type ReferenceRequest } from './reference';

/** Насколько далеко (в высотах кадра) центр может уйти от опорной точки без пересчёта. */
const MAX_OFFSET_SPANS = 8;
/** Устаревшую орбиту ещё можно показывать, пока считается новая, если сдвиг не больше этого. */
const STALE_OFFSET_SPANS = 1e4;
/** Запас точности и длины, чтобы не пересчитывать орбиту на каждом шаге зума. */
const EXTRA_BITS = 40;
const EXTRA_ITER = 1.5;

export interface ReferenceQuery {
  kind: ReferenceKind;
  center: PrecisePoint;
  param: PrecisePoint;
  span: number;
  iterations: number;
}

const samePoint = (a: PrecisePoint, b: PrecisePoint): boolean => a.x === b.x && a.y === b.y;

function offsetSpans(orbit: ReferenceOrbit, q: ReferenceQuery): number {
  const [dx, dy] = difference(q.center, orbit.center);
  return Math.hypot(dx, dy) / q.span;
}

/** Подходит ли орбита кадру без потери точности. */
export function isValidFor(orbit: ReferenceOrbit, q: ReferenceQuery): boolean {
  return (
    orbit.kind === q.kind &&
    samePoint(orbit.param, q.param) &&
    orbit.bits >= bitsFor(q.span) &&
    (orbit.escaped || orbit.maxIter >= q.iterations) &&
    offsetSpans(orbit, q) <= MAX_OFFSET_SPANS
  );
}

/**
 * Держит опорную орбиту для текущего кадра и пересчитывает её в Web Worker,
 * когда кадр уезжает слишком далеко, становится глубже или требует больше
 * итераций. Пока новая считается, отдаёт старую, если она ещё годится для
 * грубого превью, — так картинка не мигает при зуме.
 */
export class ReferenceManager {
  private current: ReferenceOrbit | null = null;
  private inFlight: number | null = null;
  private nextId = 1;
  private worker: Worker | null = null;

  constructor(private readonly onReady: () => void) {
    try {
      this.worker = new Worker(new URL('./reference.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<{ id: number; orbit: ReferenceOrbit }>) => {
        if (event.data.id !== this.inFlight) return;
        this.inFlight = null;
        this.current = event.data.orbit;
        this.onReady();
      };
    } catch {
      // Без воркеров (очень старый браузер) считаем в главном потоке.
      this.worker = null;
    }
  }

  /** Орбита для кадра или null, если подходящей нет и она ещё считается. */
  get(q: ReferenceQuery): ReferenceOrbit | null {
    const orbit = this.current;
    if (orbit && isValidFor(orbit, q)) return orbit;
    if (this.inFlight === null) this.request(q);
    if (orbit && orbit.kind === q.kind && samePoint(orbit.param, q.param) && offsetSpans(orbit, q) <= STALE_OFFSET_SPANS) {
      return orbit;
    }
    return null;
  }

  /** Считается ли сейчас новая орбита — для подписи в интерфейсе. */
  get busy(): boolean {
    return this.inFlight !== null;
  }

  private request(q: ReferenceQuery): void {
    const request: ReferenceRequest = {
      kind: q.kind,
      center: q.center,
      param: q.param,
      maxIter: Math.ceil(q.iterations * EXTRA_ITER),
      bits: bitsFor(q.span) + EXTRA_BITS,
    };
    const id = this.nextId++;
    this.inFlight = id;
    if (this.worker) {
      this.worker.postMessage({ id, request });
    } else {
      queueMicrotask(() => {
        if (this.inFlight !== id) return;
        this.inFlight = null;
        this.current = computeReference(request);
        this.onReady();
      });
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = null;
  }
}
