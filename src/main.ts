import '@fontsource/sofia-sans-extra-condensed/600.css';
import '@fontsource/sofia-sans-extra-condensed/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { h } from './dom';
import { findFractal } from './fractals';
import { mountGallery } from './gallery';
import { Renderer } from './renderer';
import { navigate, parseRoute, replaceQuery } from './router';
import { currentPalette, setPalette, subscribe } from './store';
import { createToolbar } from './toolbar';
import { mountViewer } from './viewer';

const app = document.getElementById('app')!;
let teardown: (() => void) | null = null;

/** Общий контекст для превью и мини-карт — их рисуем по очереди и копируем в 2D. */
let shared: Renderer | null = null;
try {
  shared = new Renderer(document.createElement('canvas'));
} catch (err) {
  console.error(err);
}

function notice(title: string, text: string): HTMLElement {
  return h('div', { class: 'card notice' }, h('h1', { class: 'headline' }, title), h('p', { class: 'lede' }, text));
}

function render(): void {
  teardown?.();
  teardown = null;
  app.replaceChildren();

  const route = parseRoute();
  const palette = route.query.get('p');
  if (palette) setPalette(palette);
  const def = findFractal(route.fractal);

  const toolbar = createToolbar({
    fractalId: def?.id ?? null,
    onFractal: (id) => navigate(id, new URLSearchParams({ p: currentPalette().id })),
  });
  const main = h('main', { class: 'page' });
  app.append(
    h(
      'div',
      { class: 'shell' },
      h(
        'header',
        { class: 'site-header' },
        h('a', { class: 'wordmark', href: '#/' }, h('span', { class: 'wordmark-mark', 'aria-hidden': 'true' }), 'Атлас фракталов'),
        def ? h('a', { class: 'back-link', href: '#/' }, '← Все фракталы') : null,
      ),
      toolbar.el,
      main,
    ),
  );
  window.scrollTo(0, 0);

  let dispose = (): void => {};
  if (!shared) {
    main.append(notice('Нужен WebGL2', 'Фракталы считаются на видеокарте через WebGL2, а этот браузер его не поддерживает. Попробуйте свежий Chrome, Firefox или Safari.'));
  } else {
    try {
      if (def) {
        dispose = mountViewer(main, def, route.query, shared);
      } else {
        document.title = 'Атлас фракталов';
        dispose = mountGallery(main, shared);
      }
    } catch (err) {
      console.error(err);
      main.replaceChildren(notice('Не удалось нарисовать', err instanceof Error ? err.message : String(err)));
    }
  }

  teardown = () => {
    toolbar.destroy();
    dispose();
  };
}

// В галерее гамма — единственное состояние, которое стоит хранить в адресе.
subscribe(() => {
  const route = parseRoute();
  if (!findFractal(route.fractal)) replaceQuery(null, new URLSearchParams({ p: currentPalette().id }));
});

window.addEventListener('hashchange', render);
render();
