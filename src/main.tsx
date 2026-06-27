import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { LazyMotion } from "framer-motion";
import App from "./App";
import "./styles/global.css";

// Las features de animación se cargan en un chunk aparte tras el primer render.
const loadMotionFeatures = () => import("framer-motion").then((mod) => mod.domAnimation);

// Analytics fuera del camino crítico: chunk aparte, cargado tras el primer render.
const Analytics = lazy(async () => ({ default: (await import("@vercel/analytics/react")).Analytics }));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LazyMotion features={loadMotionFeatures}>
      <App />
    </LazyMotion>
    <Suspense fallback={null}>
      <Analytics />
    </Suspense>
  </React.StrictMode>
);
