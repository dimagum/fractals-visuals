/**
 * Маршруты живут в хэше: `#/` — галерея, `#/mandelbrot?x=…&y=…&s=…` — карта.
 * Хэш-роутинг не требует настройки сервера и позволяет делиться ссылкой на
 * конкретное место фрактала.
 */
export interface Route {
  fractal: string | null;
  query: URLSearchParams;
}

export function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path = '', search = ''] = hash.split('?');
  return { fractal: path || null, query: new URLSearchParams(search) };
}

export function href(fractal: string | null, query?: URLSearchParams): string {
  const search = query && [...query.keys()].length ? `?${query}` : '';
  return `#/${fractal ?? ''}${search}`;
}

export function navigate(fractal: string | null, query?: URLSearchParams): void {
  window.location.hash = href(fractal, query);
}

/** Обновляет адрес без новой записи в истории и без события hashchange. */
export function replaceQuery(fractal: string | null, query: URLSearchParams): void {
  history.replaceState(null, '', href(fractal, query));
}
