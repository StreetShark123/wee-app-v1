import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// Analytics fuera del camino crítico: chunk aparte, cargado tras el primer render.
const Analytics = lazy(async () => ({ default: (await import("@vercel/analytics/react")).Analytics }));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Suspense fallback={null}>
      <Analytics />
    </Suspense>
  </React.StrictMode>
);
