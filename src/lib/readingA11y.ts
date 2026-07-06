import { useSyncExternalStore } from "react";

// Accesibilidad de lectura: preferencias de VISTA por-dispositivo (no de cuenta),
// guardadas en localStorage independientes de la sesión —así sobreviven al logout
// y aplican también en login/carga. Se aplican como custom props / data-attrs en
// <html>; el CSS (global.css) hace el resto. Cero backend, cero egress.

export interface ReadingA11ySettings {
  textScale: number;                 // multiplicador de la fuente raíz
  lineSpacing: "normal" | "relaxed"; // interlineado
  legibleFont: boolean;              // serif -> sans de alta legibilidad
  reduceMotion: boolean;             // fuerza sin animaciones (encima del ajuste del SO)
}

// Niveles de tamaño (90% … 150%). Tope 1.5 para no romper layouts a lo bestia.
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.5] as const;

export const DEFAULT_A11Y: ReadingA11ySettings = {
  textScale: 1,
  lineSpacing: "normal",
  legibleFont: false,
  reduceMotion: false,
};

const KEY = "wee:a11y";

const clampScale = (n: number): number => {
  const allowed = TEXT_SCALES as readonly number[];
  // Ajusta al nivel permitido más cercano (tolera valores viejos/raros).
  return allowed.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), 1);
};

const read = (): ReadingA11ySettings => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_A11Y };
    const parsed = JSON.parse(raw) as Partial<ReadingA11ySettings>;
    return {
      textScale: clampScale(Number(parsed.textScale) || 1),
      lineSpacing: parsed.lineSpacing === "relaxed" ? "relaxed" : "normal",
      legibleFont: parsed.legibleFont === true,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return { ...DEFAULT_A11Y };
  }
};

let current: ReadingA11ySettings = read();
const listeners = new Set<() => void>();

// Escribe las preferencias en <html>: --read-scale + data-line/legible/reduce-motion.
export const applyReadingA11y = (s: ReadingA11ySettings): void => {
  const el = document.documentElement;
  el.style.setProperty("--read-scale", String(s.textScale));
  el.dataset.line = s.lineSpacing;
  el.dataset.legible = s.legibleFont ? "on" : "off";
  el.dataset.reduceMotion = s.reduceMotion ? "on" : "off";
};

export const getReadingA11y = (): ReadingA11ySettings => current;

export const setReadingA11y = (patch: Partial<ReadingA11ySettings>): void => {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* almacenamiento no disponible: se aplica igual en memoria */
  }
  applyReadingA11y(current);
  listeners.forEach((fn) => fn());
};

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Hook React: re-renderiza al cambiar cualquier preferencia (útil para MePage y
// para el wrapper de framer-motion en main.tsx).
export const useReadingA11y = (): ReadingA11ySettings =>
  useSyncExternalStore(subscribe, getReadingA11y, getReadingA11y);
