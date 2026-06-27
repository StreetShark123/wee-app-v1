import { track } from "@vercel/analytics";

// Transparencia: la única señal que enviamos es la vista de página (anónima, sin
// datos personales), y el usuario puede desactivarla. Nada más se rastrea.
const OPT_OUT_KEY = "wee_analytics_opt_out";

export const isAnalyticsOptedOut = (): boolean => {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
};

export const setAnalyticsOptOut = (optOut: boolean): void => {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* almacenamiento no disponible: no pasa nada */
  }
};

const safePath = (value: string): string => value.slice(0, 120);

export const trackPageView = (path: string): void => {
  if (isAnalyticsOptedOut()) return;
  track("page_view", { path: safePath(path) });
};
