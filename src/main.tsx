import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { LazyMotion } from "framer-motion";
import App from "./App";
import { ConfirmProvider } from "./lib/confirm";
import { isAnalyticsOptedOut } from "./lib/usageAnalytics";
import { tryChunkReload } from "./lib/chunkReload";
import "./styles/global.css";

// Tras un deploy, los chunks lazy con hash viejo dan 404. Vite emite este evento:
// recargamos una vez para coger los assets nuevos (guardia anti-bucle dentro).
window.addEventListener("vite:preloadError", () => {
  tryChunkReload();
});

// PWA en desarrollo activo: comprueba si hay versión nueva al volver a la app (la
// instalada/cacheada puede quedarse atrás varios deploys). autoUpdate aplica y recarga.
const checkForAppUpdate = () => {
  navigator.serviceWorker
    ?.getRegistration()
    .then((r) => r?.update())
    .catch(() => undefined);
};
window.addEventListener("focus", checkForAppUpdate);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkForAppUpdate();
});

// Las features de animación se cargan en un chunk aparte tras el primer render.
const loadMotionFeatures = () => import("framer-motion").then((mod) => mod.domAnimation);

// Analytics fuera del camino crítico: chunk aparte, cargado tras el primer render.
const Analytics = lazy(async () => ({ default: (await import("@vercel/analytics/react")).Analytics }));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LazyMotion features={loadMotionFeatures}>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </LazyMotion>
    {!isAnalyticsOptedOut() ? (
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
    ) : null}
  </React.StrictMode>
);
