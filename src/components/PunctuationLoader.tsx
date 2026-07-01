import { createPortal } from "react-dom";
import { pick, useI18n } from "../lib/i18n";

// Carga DENTRO de la app (navegar a un libro, abrir una notificación, etc.): el
// glifo de puntuación centrado en rojo, ciclando () , * ? ... ; — overlay fijo.
// El logo "wee." se reserva SOLO para el arranque de la app (boot-splash +
// CommunityLoadingScreen, que gana por z-index si coincidiera). Portal a body
// para escapar del transform del PageTransition.
export const PunctuationLoader = () => {
  const { language } = useI18n();
  return createPortal(
    <div className="app-loading-screen" aria-busy="true" role="status" aria-label={pick(language, "Cargando", "Loading", "Cargando")}>
      <span className="app-loading-glyph" aria-hidden="true" />
    </div>,
    document.body
  );
};
