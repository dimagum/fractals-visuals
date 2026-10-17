import { expect, test, type Locator, type Page } from '@playwright/test';

/** Сколько разных цветов в холсте, уменьшенном до 32×18 — грубая проверка «что-то нарисовано». */
async function distinctColors(canvas: Locator): Promise<number> {
  return canvas.evaluate((el: HTMLCanvasElement) => {
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
}

const spanFromUrl = (page: Page): number => Number(new URL(page.url().replace('#/', '')).searchParams.get('s'));

test('галерея рисует превью всех фракталов', async ({ page }) => {
  await page.goto('./');
  const tiles = page.locator('.tile');
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count()).toBeGreaterThanOrEqual(5);
  for (const canvas of await page.locator('.tile-canvas').all()) {
    await expect.poll(() => distinctColors(canvas), { timeout: 20_000 }).toBeGreaterThan(8);
  }
});

test('переключение гаммы перекрашивает акцент', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Магма' }).click();
  await expect(page.getByRole('button', { name: 'Магма' })).toHaveAttribute('aria-pressed', 'true');
  const accent = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
  expect(accent).toBe('#e0466c');
  await expect(page).toHaveURL(/p=magma/);
});

test('глубокий зум переключается на df64 и рисует структуру', async ({ page }) => {
  await page.goto('./#/mandelbrot?x=-0.743643887037151&y=0.13182590420533&s=0.00012&p=magma');
  await expect(page.locator('.chip')).toHaveText('df64');
  await expect.poll(() => distinctColors(page.locator('.plot-canvas')), { timeout: 40_000 }).toBeGreaterThan(40);
});

test('колесо без модификатора не зумит, с Ctrl — зумит', async ({ page }) => {
  await page.goto('./#/mandelbrot?p=ink');
  const area = page.locator('.plot-area');
  await area.scrollIntoViewIfNeeded();
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => spanFromUrl(page)).toBeCloseTo(2.6, 3);
  // Сразу после прокрутки страницы подсказка намеренно молчит — ждём, пока страница успокоится.
  await page.waitForTimeout(500);

  await page.mouse.wheel(0, -200);
  await expect(page.locator('.wheel-hint')).toHaveClass(/is-visible/);
  await page.waitForTimeout(400);
  expect(spanFromUrl(page)).toBeCloseTo(2.6, 3);

  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect.poll(() => spanFromUrl(page)).toBeLessThan(2.5);
});

test('клик по известному месту перелетает к нему', async ({ page }) => {
  await page.goto('./#/mandelbrot?p=ink');
  await page.getByRole('row', { name: /Долина морских коньков/ }).click();
  await expect.poll(() => spanFromUrl(page), { timeout: 10_000 }).toBeCloseTo(0.0065, 4);
});

test('экспорт PNG отдаёт файл нужного размера', async ({ page }) => {
  await page.goto('./#/julia?p=ocean');
  await page.locator('.mini-select').selectOption('fhd');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^julia-x1-1920x\d+\.png$/);
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const png = readFileSync(path);
  // Ширина и высота лежат в заголовке IHDR, big-endian.
  expect(png.readUInt32BE(16)).toBe(1920);
  expect(png.readUInt32BE(20)).toBeGreaterThan(500);
});

test('своя гамма из ссылки применяется и редактируется', async ({ page }) => {
  await page.goto('./#/?p=custom&cp=ff0000-0000ff_000000_00ff00');
  await expect(page.locator('.pill-custom')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#00ff00');

  await page.locator('.pill-custom').click();
  const editor = page.getByRole('region', { name: 'Своя гамма' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Добавить цвет' }).click();
  await expect(editor.locator('.pe-stops input[type="color"]')).toHaveCount(3);
  await expect(page).toHaveURL(/cp=ff0000-0000ff-0000ff_000000_00ff00/);
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
});

test('степень d меняет формулу и попадает в адрес', async ({ page }) => {
  await page.goto('./#/mandelbrot?p=ink');
  await page.getByRole('group', { name: 'Степень d' }).getByRole('button', { name: '4' }).click();
  await expect(page.locator('.formula')).toHaveText(/zₙ⁴ \+ c/);
  await expect(page).toHaveURL(/pow=4/);
  await expect.poll(() => distinctColors(page.locator('.plot-canvas')), { timeout: 20_000 }).toBeGreaterThan(8);
});

test('многочлен Ньютона выбирается из списка', async ({ page }) => {
  await page.goto('./#/newton?p=viridis');
  await page.getByLabel('Многочлен p(z)').selectOption('z8+15z4-16');
  await expect(page.locator('.formula')).toContainText('z⁸ + 15z⁴ − 16');
  await expect(page).toHaveURL(/poly=z8%2B15z4-16/);
});

test('переключатель языка переводит интерфейс и сохраняет вид', async ({ page }) => {
  await page.goto('./#/mandelbrot?x=-0.7453&y=0.1127&s=0.0065&p=ink');
  await expect(page.locator('.headline')).toHaveText('Множество Мандельброта');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('.headline')).toHaveText('Mandelbrot set');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(/x=-0\.7453/);
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/[А-Яа-яЁё]/);

  // Выбор запоминается: после перезагрузки остаётся английский.
  await page.reload();
  await expect(page.locator('.headline')).toHaveText('Mandelbrot set');
  await page.getByRole('button', { name: 'RU' }).click();
  await expect(page.locator('.headline')).toHaveText('Множество Мандельброта');
});

test('браузер на английском сразу получает английский интерфейс', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.locator('.headline')).toHaveText('Fractals as maps');
  await context.close();
});

test('разбор на примере считает орбиту и следует за параметрами', async ({ page }) => {
  await page.goto('./#/mandelbrot?p=ink');
  const section = page.locator('.explain');
  await expect(section.getByRole('heading', { name: 'Как это строится' })).toBeVisible();
  // c = 0.5 + 0.5i: z₂ = 0.5 + i, выход на 5-м шаге.
  await expect(section.locator('.explain-table tbody tr').nth(2)).toContainText('0.5000 + 1.0000i');
  await expect(section.locator('.explain-verdict')).toContainText('На шаге 5');
  await section.getByRole('button', { name: 'Внутри множества' }).click();
  await expect(section.locator('.explain-verdict')).toContainText('ни разу не превысил 2');

  // Смена степени d меняет и текст шагов, и саму орбиту.
  await section.getByRole('button', { name: 'Быстро убегает' }).click();
  await page.getByRole('group', { name: 'Степень d' }).getByRole('button', { name: '3' }).click();
  await expect(section.locator('.explain-steps')).toContainText('d = 3');
  await expect(section.locator('.explain-verdict')).not.toContainText('На шаге 5');
});
