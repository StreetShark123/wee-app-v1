import { Component, type ReactNode } from "react";
import { isChunkError, tryChunkReload } from "../lib/chunkReload";

const goHome = () => {
  // Recarga completa a la raíz (coge index.html + assets frescos) y el router lleva al inicio.
  window.location.assign(import.meta.env.BASE_URL || "/");
};

const ErrorScreen = () => (
  <main>
    <section className="page-section narrow app-error-screen">
      <h2>Se ha producido un error</h2>
      <p className="hint">
        Algo no se cargó bien (a veces pasa justo después de una actualización). No te
        quedes colgado: vuelve a tu club y sigue leyendo.
      </p>
      <div className="app-error-actions">
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Reintentar
        </button>
        <button type="button" className="btn btn-primary" onClick={goHome}>
          Volver a mi club
        </button>
      </div>
    </section>
  </main>
);

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Si es un chunk viejo tras un deploy, intenta recargar (con guardia anti-bucle).
    // Si la guardia lo impide (ya recargamos hace poco), se queda la pantalla de error.
    if (isChunkError(error)) tryChunkReload();
  }

  render() {
    if (this.state.failed) return <ErrorScreen />;
    return this.props.children;
  }
}
