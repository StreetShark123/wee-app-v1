// Ventanas de frescura: si un dato se trajo hace menos de N segundos, NO se
// vuelve a pedir. Corta las llamadas redundantes (montajes, cambios de foco,
// polls) que son puro egress sin información nueva — la lección de la cuota
// agotada de 2026-07. En memoria: un arranque nuevo de la app siempre revalida.

const lastFetch = new Map<string, number>();

/** true si el dato de `key` tiene menos de `ttlMs` — sáltate la llamada. */
export const isFresh = (key: string, ttlMs: number): boolean => {
  const at = lastFetch.get(key);
  return at !== undefined && Date.now() - at < ttlMs;
};

/** Registra que `key` acaba de traerse de la red. */
export const markFetched = (key: string): void => {
  lastFetch.set(key, Date.now());
};

/** Invalida `key` (tras una escritura: la próxima lectura va a red seguro). */
export const invalidate = (key: string): void => {
  lastFetch.delete(key);
};
