/// <reference lib="webworker" />
import { computeReference, type ReferenceRequest } from './reference';

/**
 * Считает опорную орбиту вне главного потока: на глубоком зуме это тысячи
 * умножений BigInt на сотни бит, и интерфейс не должен при этом замирать.
 */
self.onmessage = (event: MessageEvent<{ id: number; request: ReferenceRequest }>) => {
  const { id, request } = event.data;
  const orbit = computeReference(request);
  self.postMessage({ id, orbit }, [orbit.data.buffer]);
};
