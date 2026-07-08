// Fuente de verdad de la valoración por ejes. Un GÉNERO = un conjunto de ejes.
// Añadir un género/eje = añadir aquí (front lo renderiza; el back solo sanea
// valores 1–5, no valida keys). Ejes en clave "cómo lo viviste", para el debate,
// no para puntuar un producto. Ver docs/rating-debate-plan.md.
import type { AppLanguage } from "./types";
import { pick } from "./i18n";

export type BookGenre = "fiction" | "nonfiction" | "other";

export interface RatingAxis {
  key: string;
  label: (l: AppLanguage) => string;
  low: (l: AppLanguage) => string;   // polo 1
  high: (l: AppLanguage) => string;  // polo 5
}

const FICTION_AXES: RatingAxis[] = [
  { key: "pace", label: (l) => pick(l, "Ritmo", "Pace", "Ritmo"), low: (l) => pick(l, "lento", "slow", "lento"), high: (l) => pick(l, "trepidante", "gripping", "trepidante") },
  { key: "focus", label: (l) => pick(l, "Personajes ↔ trama", "Characters ↔ plot", "Personaxes ↔ trama"), low: (l) => pick(l, "me movieron los personajes", "the characters moved me", "movéronme os personaxes"), high: (l) => pick(l, "me movió la trama", "the plot moved me", "moveume a trama") },
  { key: "emotion", label: (l) => pick(l, "Emoción", "Emotion", "Emoción"), low: (l) => pick(l, "me dejó frío", "left me cold", "deixoume frío"), high: (l) => pick(l, "me removió", "stirred me", "removeume") },
  { key: "prose", label: (l) => pick(l, "Prosa", "Prose", "Prosa"), low: (l) => pick(l, "funcional", "functional", "funcional"), high: (l) => pick(l, "me enamoró la escritura", "the writing won me over", "namoroume a escritura") }
];

const NONFICTION_AXES: RatingAxis[] = [
  { key: "rigor", label: (l) => pick(l, "Solidez", "Rigour", "Solidez"), low: (l) => pick(l, "flojo", "weak", "frouxo"), high: (l) => pick(l, "convincente", "convincing", "convincente") },
  { key: "clarity", label: (l) => pick(l, "Claridad", "Clarity", "Claridade"), low: (l) => pick(l, "denso", "dense", "denso"), high: (l) => pick(l, "cristalino", "crystal-clear", "cristalino") },
  { key: "novelty", label: (l) => pick(l, "Novedad", "Novelty", "Novidade"), low: (l) => pick(l, "ya lo sabía", "I knew it already", "xa o sabía"), high: (l) => pick(l, "me abrió la cabeza", "blew my mind", "abriume a cabeza") },
  { key: "impact", label: (l) => pick(l, "Me removió", "It moved me", "Removeume"), low: (l) => pick(l, "me dejó igual", "left me unchanged", "deixoume igual"), high: (l) => pick(l, "me cambió la opinión", "changed my mind", "cambioume a opinión") }
];

export const GENRE_AXES: Record<BookGenre, RatingAxis[]> = {
  fiction: FICTION_AXES,
  nonfiction: NONFICTION_AXES,
  other: []
};

export const GENRES: { key: BookGenre; label: (l: AppLanguage) => string }[] = [
  { key: "fiction", label: (l) => pick(l, "Ficción", "Fiction", "Ficción") },
  { key: "nonfiction", label: (l) => pick(l, "No ficción", "Non-fiction", "Non ficción") },
  { key: "other", label: (l) => pick(l, "Otro", "Other", "Outro") }
];

export const normalizeGenre = (g?: string | null): BookGenre | null =>
  g === "fiction" || g === "nonfiction" || g === "other" ? g : null;

export const axesForGenre = (g?: string | null): RatingAxis[] => {
  const n = normalizeGenre(g);
  return n ? GENRE_AXES[n] : [];
};

export const genreLabel = (g: string | null | undefined, l: AppLanguage): string =>
  GENRES.find((x) => x.key === normalizeGenre(g))?.label(l) ?? "";
