/**
 * Многочлены для фрактала Ньютона: коэффициенты по возрастанию степени,
 * a₀ + a₁z + … + aₙzⁿ, и их комплексные корни.
 */
export type Complex = [number, number];

export interface Polynomial {
  id: string;
  label: string;
  /** a₀ … aₙ, вещественные. */
  coeffs: number[];
  /** Вид, в котором хорошо видны все бассейны. */
  span: number;
}

export const MAX_DEGREE = 8;

export const NEWTON_POLYNOMIALS: Polynomial[] = [
  { id: 'z3-1', label: 'z³ − 1', coeffs: [-1, 0, 0, 1], span: 3 },
  { id: 'z4-1', label: 'z⁴ − 1', coeffs: [-1, 0, 0, 0, 1], span: 3 },
  { id: 'z5-1', label: 'z⁵ − 1', coeffs: [-1, 0, 0, 0, 0, 1], span: 3 },
  { id: 'z5-z', label: 'z⁵ − z', coeffs: [0, -1, 0, 0, 0, 1], span: 3 },
  { id: 'z6+z3-1', label: 'z⁶ + z³ − 1', coeffs: [-1, 0, 0, 1, 0, 0, 1], span: 3 },
  { id: 'z3-2z+2', label: 'z³ − 2z + 2', coeffs: [2, -2, 0, 1], span: 3.4 },
  { id: 'z8+15z4-16', label: 'z⁸ + 15z⁴ − 16', coeffs: [-16, 0, 0, 0, 15, 0, 0, 0, 1], span: 5 },
];

export function findPolynomial(id: string | null | undefined): Polynomial {
  return NEWTON_POLYNOMIALS.find((p) => p.id === id) ?? NEWTON_POLYNOMIALS[0]!;
}

const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const sub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
const div = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

export function evaluate(coeffs: number[], z: Complex): Complex {
  let acc: Complex = [0, 0];
  for (let k = coeffs.length - 1; k >= 0; k--) {
    acc = mul(acc, z);
    acc[0] += coeffs[k]!;
  }
  return acc;
}

/**
 * Все корни методом Дюрана–Кернера (Вейерштрасса): одновременная итерация
 * zᵢ ← zᵢ − p(zᵢ) / ∏ⱼ≠ᵢ (zᵢ − zⱼ) из точек на окружности, не лежащих на осях.
 */
export function findRoots(coeffs: number[]): Complex[] {
  const degree = coeffs.length - 1;
  const lead = coeffs[degree]!;
  const monic = coeffs.map((c) => c / lead);
  const radius = 1 + Math.max(...monic.slice(0, degree).map(Math.abs));
  let roots: Complex[] = Array.from({ length: degree }, (_, k) => {
    const angle = (2 * Math.PI * k) / degree + 0.4;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  for (let iter = 0; iter < 500; iter++) {
    let shift = 0;
    roots = roots.map((zi, i) => {
      let denom: Complex = [1, 0];
      roots.forEach((zj, j) => {
        if (j !== i) denom = mul(denom, sub(zi, zj));
      });
      const step = div(evaluate(monic, zi), denom);
      shift = Math.max(shift, Math.hypot(step[0], step[1]));
      return sub(zi, step);
    });
    if (shift < 1e-14) break;
  }
  // Убираем шум вида 1e-17 у вещественных и чисто мнимых корней.
  return roots.map(([re, im]) => [Math.abs(re) < 1e-12 ? 0 : re, Math.abs(im) < 1e-12 ? 0 : im]);
}
