import {
  CUSTOM_ID,
  DEFAULT_CUSTOM,
  PALETTES,
  decodeCustom,
  encodeCustom,
  findPalette,
  resolveColors,
  type Palette,
  type PaletteColors,
} from './palettes';

/**
 * Глобальное состояние, общее для всех экранов: выбранная гамма, своя гамма
 * пользователя и тема системы. Акцент гаммы выставляется в CSS-переменные,
 * так что обводки, бейджи и ползунки перекрашиваются без участия JS.
 */
type Listener = () => void;

const PALETTE_KEY = 'fractals.palette';
const CUSTOM_KEY = 'fractals.customPalette';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<Listener>();

let paletteId = validId(read(PALETTE_KEY));
let custom: PaletteColors = decodeCustom(read(CUSTOM_KEY) ?? '') ?? DEFAULT_CUSTOM;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Хранилище недоступно (приватный режим) — выбор просто не запомнится.
  }
}

function validId(id: string | null): string {
  return id === CUSTOM_ID || PALETTES.some((p) => p.id === id) ? id! : PALETTES[0]!.id;
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

export function paletteById(id: string): Palette {
  return id === CUSTOM_ID ? { id: CUSTOM_ID, name: 'Своя', ...custom } : findPalette(id);
}

export function currentPalette(): Palette {
  return paletteById(paletteId);
}

export function isDark(): boolean {
  return darkQuery.matches;
}

/** Цвета гаммы с учётом светлой/тёмной темы. */
export function colors(p: Palette = currentPalette()): PaletteColors {
  return resolveColors(p, isDark());
}

export function setPalette(id: string): void {
  const next = validId(id);
  if (next === paletteId) return;
  paletteId = next;
  write(PALETTE_KEY, next);
  notify();
}

export function customColors(): PaletteColors {
  return custom;
}

export function setCustomColors(next: PaletteColors): void {
  custom = next;
  write(CUSTOM_KEY, encodeCustom(next));
  if (paletteId === CUSTOM_ID) notify();
}

/** Гамма в адресе: `p=<id>`, а для своей ещё и её цвета в `cp`. */
export function writePaletteQuery(query: URLSearchParams): URLSearchParams {
  query.set('p', paletteId);
  if (paletteId === CUSTOM_ID) query.set('cp', encodeCustom(custom));
  else query.delete('cp');
  return query;
}

/** Применяет гамму из адреса, если она там есть. */
export function readPaletteQuery(query: URLSearchParams): void {
  const cp = query.get('cp');
  const decoded = cp ? decodeCustom(cp) : null;
  if (decoded) setCustomColors(decoded);
  const p = query.get('p');
  if (p) setPalette(p);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

darkQuery.addEventListener('change', notify);
applyCss();
