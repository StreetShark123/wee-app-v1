import { pick } from "./i18n";
import type { AppLanguage } from "./types";
import type { BookStatus } from "./communityApi";

// Etiqueta del estado de un libro — compartida entre la ficha (BookDetailPage)
// y la card de la estantería (BookCard, reverso).
export const statusLabel = (status: BookStatus, language: AppLanguage): string => {
  if (status === "reading") return pick(language, "En lectura", "Reading", "En lectura");
  if (status === "finished") return pick(language, "Leído por el club", "Read by the club", "Lido polo club");
  if (status === "rejected") return pick(language, "Descartado", "Declined", "Descartado");
  return pick(language, "Propuesto", "Proposed", "Proposto");
};
