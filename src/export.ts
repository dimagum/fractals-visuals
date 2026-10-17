import type { PaletteColors } from './palettes';
import { Renderer, type DrawParams } from './renderer';
import { t } from './i18n';

/** Бюджет на одну полосу, мс: держит GPU отзывчивым и не будит сторожевой таймер драйвера. */
const STRIP_BUDGET_MS = 60;

export interface ExportJob {
  cancelled: boolean;
}

/**
 * Рисует текущий вид в отдельном WebGL-контексте заданного размера и
 * возвращает PNG. Кадр считается полосами с паузами для браузера: тяжёлый 4K-рендер
 * с df64 может идти секунды, и одним вызовом это подвесило бы вкладку.
 */
export async function renderPng(
  params: DrawParams,
  colors: PaletteColors,
  width: number,
  height: number,
  job: ExportJob,
  onProgress: (fraction: number) => void,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new Renderer(canvas);
  try {
    renderer.setPalette(colors);
    let top = height;
    let rows = 32;
    while (top > 0) {
      if (job.cancelled) return null;
      const y0 = Math.max(0, top - rows);
      const t0 = performance.now();
      renderer.draw(params, [y0, top]);
      renderer.sync();
      const ms = Math.max(1, performance.now() - t0);
      rows = Math.max(8, Math.round((rows * STRIP_BUDGET_MS) / ms));
      top = y0;
      onProgress(1 - top / height);
      // Отдаём управление браузеру между полосами. setTimeout, а не rAF: в фоновой
      // вкладке rAF замирает, и экспорт встал бы до возвращения на страницу.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    if (job.cancelled) return null;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ExportSize = 'screen' | 'fhd' | '4k';

export const EXPORT_SIZES: { id: ExportSize; label: () => string }[] = [
  { id: 'screen', label: () => t('exportScreen') },
  { id: 'fhd', label: () => 'Full HD' },
  { id: '4k', label: () => '4K' },
];

/** Размер картинки с пропорциями карты: длинная сторона 1920 или 3840 пикселей. */
export function exportDimensions(size: ExportSize, screen: [number, number], aspect: number): [number, number] {
  if (size === 'screen') return screen;
  const long = size === '4k' ? 3840 : 1920;
  return aspect >= 1 ? [long, Math.round(long / aspect)] : [Math.round(long * aspect), long];
}
