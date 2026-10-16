import { h } from './dom';
import { FRACTALS, effectiveIterations, parseSequence, type FractalDef } from './fractals';
import type { Renderer } from './renderer';
import { href } from './router';
import { colors, subscribe } from './store';

/**
 * Галерея: сетка квадратных плиток с превью каждого фрактала. Превью рисует
 * один общий WebGL-контекст по очереди и копирует результат в 2D-холст
 * плитки — так не упираемся в лимит браузера на число WebGL-контекстов.
 */
export function mountGallery(root: HTMLElement, renderer: Renderer): () => void {
  const tiles = FRACTALS.map((def, i) => {
    const canvas = h('canvas', { class: 'tile-canvas', 'aria-hidden': 'true' });
    const el = h(
      'a',
      { class: 'tile', href: href(def.id), 'aria-label': `${def.name}: ${def.blurb}` },
      canvas,
      h('span', { class: 'tile-index' }, String(i + 1).padStart(2, '0')),
      h(
        'span',
        { class: 'tile-caption' },
        h('span', { class: 'tile-name' }, def.short),
        h('span', { class: 'tile-formula' }, def.formula),
      ),
    );
    return { def, el, canvas };
  });

  const section = h(
    'section',
    { class: 'gallery' },
    h(
      'header',
      { class: 'gallery-head' },
      h('p', { class: 'overline' }, `Атлас · ${FRACTALS.length} фракталов`),
      h('h1', { class: 'headline' }, 'Фракталы как карты'),
      h(
        'p',
        { class: 'lede' },
        'Пять самых известных фракталов, построенных по формулам прямо на видеокарте. Выберите плитку — и приближайте, пока хватает точности.',
      ),
    ),
    h('div', { class: 'tile-grid' }, ...tiles.map((t) => t.el)),
  );
  root.append(section);

  let queue: typeof tiles = [];
  let raf = 0;

  const renderNext = (): void => {
    raf = 0;
    const tile = queue.shift();
    if (!tile) return;
    drawPreview(renderer, tile.def, tile.canvas);
    if (queue.length) raf = requestAnimationFrame(renderNext);
  };

  const renderAll = (): void => {
    queue = [...tiles];
    if (!raf) raf = requestAnimationFrame(renderNext);
  };

  renderer.setPalette(colors());
  renderAll();

  const unsubscribe = subscribe(() => {
    renderer.setPalette(colors());
    renderAll();
  });

  let lastWidth = 0;
  const observer = new ResizeObserver(([entry]) => {
    const width = Math.round(entry?.contentRect.width ?? 0);
    if (width && width !== lastWidth) {
      lastWidth = width;
      renderAll();
    }
  });
  observer.observe(tiles[0]!.el);

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    unsubscribe();
  };
}

function drawPreview(renderer: Renderer, def: FractalDef, target: HTMLCanvasElement): void {
  const rect = target.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = Math.max(64, Math.round(rect.width * dpr));
  renderer.canvas.width = size;
  renderer.canvas.height = size;
  renderer.draw({
    fractal: def,
    view: def.preview,
    iterations: effectiveIterations(def, def.iterations.base, def.preview.span),
    density: 1,
    julia: def.defaultJulia ?? [0, 0],
    sequence: parseSequence(def.defaultSequence ?? 'AB') ?? [0, 1],
  });
  target.width = size;
  target.height = size;
  target.getContext('2d')?.drawImage(renderer.canvas, 0, 0);
}
