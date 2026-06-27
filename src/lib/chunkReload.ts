// Recuperación de "chunk viejo tras deploy": cuando un import() lazy falla porque el
// hash del fichero cambió en el último despliegue, recargamos UNA vez para coger los
// assets nuevos. Guardia por tiempo para no entrar en bucle si el fallo es real (offline).
const KEY = "wee_chunk_reload_at";
const GUARD_MS = 10000;

export const tryChunkReload = (): boolean => {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > GUARD_MS) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    /* sessionStorage no disponible: no recargamos */
  }
  return false;
};

export const isChunkError = (e: unknown): boolean => {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /dynamically imported module|ChunkLoadError|Loading chunk|Importing a module script failed|error loading dynamically imported/i.test(
    msg
  );
};
