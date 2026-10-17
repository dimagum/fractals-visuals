import { locale } from './i18n';

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Минимальный конструктор DOM: h('a', { class: 'x', href: '#', onclick }, 'текст'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  el.append(...children.filter((c): c is Node | string => c != null && c !== false));
  return el;
}

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

/** Целое число надстрочными цифрами: 12 → ¹². */
export function superscript(n: number): string {
  return [...String(n)].map((ch) => SUPERSCRIPT[ch] ?? ch).join('');
}

/** Типографский минус вместо дефиса. */
export function minus(text: string): string {
  return text.replace(/-/g, '−');
}

export function formatFixed(value: number, decimals: number): string {
  const fixed = value.toFixed(Math.min(20, Math.max(0, decimals)));
  return minus(/^-0(\.0*)?$/.test(fixed) ? fixed.slice(1) : fixed);
}

/** ×1 240 или ×3.2·10⁸ для больших увеличений. */
export function formatZoom(zoom: number): string {
  if (zoom < 1e5) {
    const rounded = zoom < 10 ? Math.round(zoom * 10) / 10 : Math.round(zoom);
    return `×${rounded.toLocaleString(locale())}`;
  }
  const exp = Math.floor(Math.log10(zoom));
  const mantissa = (zoom / 10 ** exp).toFixed(1);
  return `×${mantissa}·10${superscript(exp)}`;
}

export function formatInt(value: number): string {
  return value.toLocaleString(locale());
}
