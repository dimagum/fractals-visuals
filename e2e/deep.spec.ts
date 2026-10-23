import { expect, test } from '@playwright/test';
import { effectiveIterations, findFractal } from '../src/fractals';
import { fromDecimal, offsetPoint, pointFromNumbers } from '../src/precise';
import { bitsFor, computeReference } from '../src/reference';

/**
 * Теория возмущений против «честной» итерации: кадр ×2.4·10²² на границе
 * множества Жюлиа (кролик Дуади) рисуется на GPU, а для сетки пикселей то же
 * самое считается в Node полной BigInt-итерацией. Внутренность красится в
 * чистый зелёный — так «внутри / снаружи» читается с картинки однозначно.
 */
const X = '0.351645618333478088011314481899';
const Y = '0.210987371000086844998687449492';
const SPAN = 1e-22;
const C: [number, number] = [-0.123, 0.745];
const GRID: [number, number] = [16, 10];

test('возмущения на ×10²² совпадают с BigInt-итерацией', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 760, height: 640 });
  await page.goto(`./#/julia?x=${X}&y=${Y}&s=${SPAN}&c=${C.join(',')}&p=custom&cp=000000-ffffff_00ff00_ff0000`);
  await expect(page.locator('.chip')).toHaveText('ptb', { timeout: 60_000 });

  // Ждём, пока прогрессивная дорисовка закончится: картинка перестанет меняться.
  const canvas = page.locator('.plot-canvas');
  const signature = (): Promise<string> =>
    canvas.evaluate((el: HTMLCanvasElement) => {
      const probe = document.createElement('canvas');
      probe.width = 48;
      probe.height = 27;
      probe.getContext('2d')!.drawImage(el, 0, 0, 48, 27);
      return probe.toDataURL();
    });
  let previous = '';
  await expect
    .poll(
      async () => {
        const current = await signature();
        const stable = current === previous;
        previous = current;
        return stable;
      },
      { timeout: 200_000, intervals: [3000] },
    )
    .toBe(true);

  const sample = await canvas.evaluate((el: HTMLCanvasElement, [gx, gy]) => {
    const probe = document.createElement('canvas');
    probe.width = el.width;
    probe.height = el.height;
    const ctx = probe.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const points: { x: number; y: number; inside: boolean }[] = [];
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        const x = Math.floor(((i + 0.5) / gx) * el.width);
        const y = Math.floor(((j + 0.5) / gy) * el.height);
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        points.push({ x, y, inside: r! < 10 && g! > 245 && b! < 10 });
      }
    }
    return { width: el.width, height: el.height, points };
  }, GRID);

  const center = { x: fromDecimal(X)!, y: fromDecimal(Y)! };
  const param = pointFromNumbers(...C);
  const iterations = effectiveIterations(findFractal('julia')!, findFractal('julia')!.iterations.base, SPAN);
  const { width, height } = sample;
  let agree = 0;
  let inside = 0;
  for (const p of sample.points) {
    const point = offsetPoint(
      center,
      ((p.x + 0.5 - width / 2) * SPAN) / height,
      ((height - (p.y + 0.5) - height / 2) * SPAN) / height,
    );
    const cpuInside = !computeReference({ kind: 'julia', center: point, param, maxIter: iterations, bits: bitsFor(SPAN) + 40 }).escaped;
    if (cpuInside === p.inside) agree++;
    if (cpuInside) inside++;
  }
  // Кадр должен содержать и внутренние, и внешние точки — иначе проверка ничего не значит.
  expect(inside).toBeGreaterThan(sample.points.length * 0.2);
  expect(inside).toBeLessThan(sample.points.length * 0.8);
  // Допускаем единичные расхождения у самой границы, где точка убегает на последних итерациях.
  expect(agree / sample.points.length).toBeGreaterThan(0.97);
});

test('перелёт к месту на ×10²⁹ и экспорт PNG с этой глубины', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 760, height: 640 });
  await page.goto('./#/mandelbrot?p=magma');
  await page.getByRole('row', { name: /×10²⁹/ }).click();
  // Перелёт заканчивается точно в заданной точке: span и 30+ знаков центра в адресе.
  await expect.poll(() => new URL(page.url().replace('#/', '')).searchParams.get('s'), { timeout: 30_000 }).toBe('9.000e-30');
  expect(new URL(page.url().replace('#/', '')).searchParams.get('x')).toMatch(/^-0\.7436438870409373436807635224409/);
  await expect(page.locator('.chip')).toHaveText('ptb', { timeout: 60_000 });

  const distinct = (): Promise<number> =>
    page.locator('.plot-canvas').evaluate((el: HTMLCanvasElement) => {
      const probe = document.createElement('canvas');
      probe.width = 32;
      probe.height = 18;
      const ctx = probe.getContext('2d')!;
      ctx.drawImage(el, 0, 0, 32, 18);
      const data = ctx.getImageData(0, 0, 32, 18).data;
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return seen.size;
    });
  await expect.poll(distinct, { timeout: 200_000 }).toBeGreaterThan(60);

  // Экспорт рисует в отдельном WebGL-контексте — ему тоже нужна опорная орбита.
  await page.locator('.mini-select').selectOption('screen');
  const downloadPromise = page.waitForEvent('download', { timeout: 200_000 });
  await page.getByRole('button', { name: 'Скачать PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^mandelbrot-x2\.9e29-\d+x\d+\.png$/);
  const { statSync } = await import('node:fs');
  // Однотонная картинка сжалась бы в килобайты; детализированная весит заметно больше.
  expect(statSync(await download.path()).size).toBeGreaterThan(100_000);
});
