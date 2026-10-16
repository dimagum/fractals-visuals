import type { View } from './fractals';

const RHO = Math.SQRT2;

/**
 * Плавный перелёт камеры по ван Вейку и Нёйсу («Smooth and efficient zooming
 * and panning», 2003): камера сначала отдаляется ровно настолько, чтобы обе
 * точки поместились в кадр, затем приближается к цели. Возвращает функцию
 * t ∈ [0, 1] → вид и «длину» пути S для расчёта длительности.
 */
export function flightPath(from: View, to: View): { at: (t: number) => View; length: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const d = Math.hypot(dx, dy);
  const w0 = from.span;
  const w1 = to.span;

  // Сдвиг пренебрежимо мал по сравнению с кадром — это чистый зум.
  if (d < 1e-6 * Math.min(w0, w1)) {
    const length = Math.log(w1 / w0) / RHO;
    return {
      length: Math.abs(length),
      at: (t) => ({ cx: from.cx + dx * t, cy: from.cy + dy * t, span: w0 * Math.exp(RHO * t * length) }),
    };
  }

  const b0 = (w1 * w1 - w0 * w0 + RHO ** 4 * d * d) / (2 * w0 * RHO ** 2 * d);
  const b1 = (w1 * w1 - w0 * w0 - RHO ** 4 * d * d) / (2 * w1 * RHO ** 2 * d);
  // ln(√(b² + 1) − b) = −asinh(b), но без потери точности при больших b.
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const length = (r1 - r0) / RHO;
  const coshR0 = Math.cosh(r0);
  return {
    length,
    at: (t) => {
      const s = t * length;
      const u = (w0 / (RHO ** 2 * d)) * (coshR0 * Math.tanh(RHO * s + r0) - Math.sinh(r0));
      return { cx: from.cx + u * dx, cy: from.cy + u * dy, span: (w0 * coshR0) / Math.cosh(RHO * s + r0) };
    },
  };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
