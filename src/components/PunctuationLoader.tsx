import { pick, useI18n } from "../lib/i18n";

// Carga a pantalla completa: solo el glifo de puntuación centrado en rojo, ciclando
// () , * ? ... ; — overlay fijo que tapa footer/topbar. Se usa mientras la página
// carga por primera vez (sin caché), en vez de esqueletos.
export const PunctuationLoader = () => {
  const { language } = useI18n();
  return (
    <div className="app-loading-screen" aria-busy="true" role="status" aria-label={pick(language, "Cargando", "Loading", "Cargando")}>
      <span className="app-loading-glyph" aria-hidden="true" />
    </div>
  );
};
