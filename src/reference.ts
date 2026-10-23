import { FRAC, type Fixed, type PrecisePoint } from './precise';

/**
 * Опорная орбита для теории возмущений: одна точка — центр кадра —
 * итерируется на процессоре в произвольной точности, а все пиксели потом
 * считают на видеокарте только своё маленькое отклонение от неё.
 *
 * Сами значения Zₙ лежат в круге |Z| ≤ 2 и хранятся в double: в шейдер они
 * уходят парой float (hi + lo), потому что при ребейзинге z = Z + δz вычитаются
 * близкие числа и точности одного float32 не хватает. Произвольная точность
 * нужна, чтобы орбита действительно принадлежала заданной точке, а не её
 * соседке за 10⁻¹⁶.
 */
export type ReferenceKind = 'mandelbrot' | 'julia';

export interface ReferenceRequest {
  kind: ReferenceKind;
  /** Опорная точка: c у Мандельброта, z₀ у Жюлиа. */
  center: PrecisePoint;
  /** Параметр c у Жюлиа (в Мандельброте не используется). */
  param: PrecisePoint;
  maxIter: number;
  /** Сколько двоичных знаков после запятой держать в вычислениях. */
  bits: number;
}

export interface ReferenceOrbit {
  kind: ReferenceKind;
  center: PrecisePoint;
  param: PrecisePoint;
  /** Z₀, Z₁, … парами (Re, Im) в double. */
  data: Float64Array;
  length: number;
  maxIter: number;
  bits: number;
  /** Опорная точка сама убежала раньше maxIter — дальше выручает ребейзинг. */
  escaped: boolean;
}

/** Предел |Z|², после которого орбиту дальше не пишем: как радиус выхода в шейдере. */
const BAILOUT2 = 65536;

export function bitsFor(span: number): number {
  // Знаков должно хватать на пиксель (~span/1000) с запасом: ошибка опорной
  // орбиты равносильна сдвигу опорной точки.
  return Math.max(96, Math.ceil(Math.log2(1 / span)) + 72);
}

function toBits(value: Fixed, bits: number): bigint {
  const shift = FRAC - BigInt(bits);
  return shift >= 0n ? value >> shift : value << -shift;
}

export function computeReference(req: ReferenceRequest): ReferenceOrbit {
  const p = BigInt(req.bits);
  const scale = 2 ** req.bits;
  const bail = BigInt(BAILOUT2) << p;
  const julia = req.kind === 'julia';

  // Мандельброт: Z₀ = 0, c — опорная точка. Жюлиа: Z₀ — опорная точка, c — параметр.
  let x = julia ? toBits(req.center.x, req.bits) : 0n;
  let y = julia ? toBits(req.center.y, req.bits) : 0n;
  const cx = toBits(julia ? req.param.x : req.center.x, req.bits);
  const cy = toBits(julia ? req.param.y : req.center.y, req.bits);

  const data = new Float64Array((req.maxIter + 1) * 2);
  let length = 0;
  let escaped = false;
  for (let n = 0; n <= req.maxIter; n++) {
    data[2 * n] = Number(x) / scale;
    data[2 * n + 1] = Number(y) / scale;
    length = n + 1;
    const x2 = (x * x) >> p;
    const y2 = (y * y) >> p;
    if (x2 + y2 > bail) {
      escaped = true;
      break;
    }
    const xy = (x * y) >> (p - 1n); // 2xy
    x = x2 - y2 + cx;
    y = xy + cy;
  }
  return {
    kind: req.kind,
    center: req.center,
    param: req.param,
    data: data.slice(0, length * 2),
    length,
    maxIter: req.maxIter,
    bits: req.bits,
    escaped,
  };
}
