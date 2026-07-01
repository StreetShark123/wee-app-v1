import { createPortal } from "react-dom";
import { pick, useI18n } from "../lib/i18n";

// Carga a pantalla completa: solo el glifo de puntuación centrado en rojo, ciclando
// () , * ? ... ; — overlay fijo. Portal a body para escapar del transform del
// PageTransition (si no, `position: fixed` se ancla al contenedor transformado y
// ni centra ni tapa el footer).
export const PunctuationLoader = () => {
  const { language } = useI18n();
  return createPortal(
    <div className="app-loading-screen" aria-busy="true" role="status" aria-label={pick(language, "Cargando", "Loading", "Cargando")}>
      <span className="app-loading-glyph" aria-hidden="true" />
    </div>,
    document.body
  );
};
