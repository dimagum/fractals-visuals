/**
 * Числа произвольной точности для центра вида и опорной орбиты: BigInt с
 * фиксированной точкой, значение = v / 2^FRAC. 320 двоичных знаков после
 * запятой — около 96 десятичных, с огромным запасом для зума до ×10³⁰.
 *
 * double хранит лишь ~16 значащих цифр, поэтому на увеличении ×10¹⁵ и дальше
 * центр карты в нём уже не помещается: сдвиг на пиксель просто теряется.
 */
export type Fixed = bigint;

export const FRAC = 320n;
const FRAC_NUM = Number(FRAC);
export const ONE: Fixed = 1n << FRAC;

/** Точный перевод double → Fixed: double — это m·2^e с целым m, переводим без округления. */
export function fromNumber(x: number): Fixed {
  if (!Number.isFinite(x)) throw new RangeError(`Не число: ${x}`);
  if (x === 0) return 0n;
  let m = x;
  let e = 0;
  // Умножение на 2 у double точное, так что за ≤ 1074 шагов получаем целое m.
  while (!Number.isInteger(m)) {
    m *= 2;
    e -= 1;
  }
  const shift = BigInt(e) + FRAC;
  const big = BigInt(m);
  return shift >= 0n ? big << shift : big >> -shift;
}

function bitLength(a: bigint): number {
  return a === 0n ? 0 : a.toString(2).length;
}

/** Ближайший double. Сохраняет 64 старших бита, поэтому работает и для крошечных значений. */
export function toNumber(f: Fixed): number {
  if (f === 0n) return 0;
  const neg = f < 0n;
  const a = neg ? -f : f;
  const drop = Math.max(0, bitLength(a) - 64);
  const value = Number(a >> BigInt(drop)) * 2 ** (drop - FRAC_NUM);
  return neg ? -value : value;
}

/** Разбор десятичной записи вида «−0.7436438870371587047521915061», в том числе с экспонентой. */
export function fromDecimal(text: string): Fixed | null {
  const match = /^\s*([+\-−]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?\s*$/i.exec(text);
  if (!match || (!match[2] && !match[3])) return null;
  const negative = match[1] === '-' || match[1] === '−';
  const fraction = match[3] ?? '';
  const digits = BigInt((match[2] || '0') + fraction);
  // value = digits · 10^(−scale)
  const scale = fraction.length - Number(match[4] ?? 0);
  let value: Fixed;
  if (scale <= 0) {
    value = (digits * 10n ** BigInt(-scale)) << FRAC;
  } else {
    const den = 10n ** BigInt(scale);
    value = ((digits << FRAC) + den / 2n) / den;
  }
  return negative ? -value : value;
}

/** Десятичная запись с округлением до `decimals` знаков после точки. */
export function toDecimal(f: Fixed, decimals: number): string {
  const digits = Math.max(0, Math.round(decimals));
  const neg = f < 0n;
  const a = neg ? -f : f;
  const scaled = (a * 10n ** BigInt(digits) + (ONE >> 1n)) >> FRAC;
  const text = scaled.toString().padStart(digits + 1, '0');
  const int = text.slice(0, text.length - digits);
  const frac = digits > 0 ? `.${text.slice(text.length - digits)}` : '';
  return `${neg && scaled !== 0n ? '-' : ''}${int}${frac}`;
}

/** Деление с округлением вниз и вверх — у BigInt «/» отбрасывает дробь к нулю. */
export function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n === b < 0n ? q + 1n : q;
}

/** Точка комплексной плоскости в произвольной точности. */
export interface PrecisePoint {
  x: Fixed;
  y: Fixed;
}

export function pointFromNumbers(x: number, y: number): PrecisePoint {
  return { x: fromNumber(x), y: fromNumber(y) };
}

/** Сдвиг точной точки на небольшое смещение, заданное в double. */
export function offsetPoint(p: PrecisePoint, dx: number, dy: number): PrecisePoint {
  return { x: p.x + fromNumber(dx), y: p.y + fromNumber(dy) };
}

/** Разность двух точных точек как пара double — для смещений порядка размера кадра. */
export function difference(a: PrecisePoint, b: PrecisePoint): [number, number] {
  return [toNumber(a.x - b.x), toNumber(a.y - b.y)];
}
