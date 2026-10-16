import { findPalette, resolveColors, type Palette, type PaletteColors } from './palettes';

/**
 * Глобальное состояние, общее для всех экранов: выбранная гамма и тема
 * системы. Акцент гаммы выставляется в CSS-переменные, так что обводки,
 * бейджи и ползунки перекрашиваются без участия JS.
 */
type Listener = () => void;

const STORAGE_KEY = 'fractals.palette';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<Listener>();

let palette: Palette = findPalette(readStored());

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyCss(): void {
  const { accent } = colors();
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--on-accent', luminance(accent) > 0.45 ? '#121210' : '#fbfaf5');
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function notify(): void {
  applyCss();
  listeners.forEach((fn) => fn());
}

export function currentPalette(): Palette {
  return palette;
}

export function isDark(): boolean {
  return darkQuery.matches;
}

/** Цвета текущей гаммы с учётом светлой/тёмной темы. */
export function colors(p: Palette = palette): PaletteColors {
  return resolveColors(p, isDark());
}

export function setPalette(id: string): void {
  const next = findPalette(id);
  if (next === palette) return;
  palette = next;
  try {
    localStorage.setItem(STORAGE_KEY, next.id);
  } catch {
    // Хранилище недоступно (приватный режим) — гамма просто не запомнится.
  }
  notify();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

darkQuery.addEventListener('change', notify);
applyCss();
