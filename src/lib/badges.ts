// Reconocimientos del club: HITOS personales que se celebran, nunca ranking ni
// competición (principio rector de wee). Derivados de tus propios datos, sin
// esquema. Premian participar y aportar al debate (ejes), no "puntuar mucho".
import type { UserProfileBook } from "./communityApi";
import type { IconName } from "../components/Icon";
import { pick } from "./i18n";
import type { AppLanguage } from "./types";

export interface Badge {
  id: string;
  icon: IconName;
  label: (l: AppLanguage) => string;
  desc: (l: AppLanguage) => string;
  reached: (s: BadgeStats) => boolean;
}

export interface BadgeStats {
  finished: number;
  reviews: number;
  axesBooks: number; // libros con valoración por ejes (≥3 ejes = "completa")
}

export const badgeStats = (books: UserProfileBook[]): BadgeStats => ({
  finished: books.filter((b) => b.shelf === "finished").length,
  reviews: books.filter((b) => (b.review ?? "").trim().length > 0).length,
  axesBooks: books.filter((b) => b.axes && Object.keys(b.axes).length >= 3).length
});

// Orden = progresión. La UI muestra los conseguidos + el siguiente "a un paso".
export const BADGES: Badge[] = [
  { id: "first_finish", icon: "check", label: (l) => pick(l, "Primer libro", "First book", "Primeiro libro"), desc: (l) => pick(l, "Terminaste tu primer libro con el club.", "You finished your first book with the club.", "Remataches o teu primeiro libro co club."), reached: (s) => s.finished >= 1 },
  { id: "first_review", icon: "comment", label: (l) => pick(l, "Primera voz", "First voice", "Primeira voz"), desc: (l) => pick(l, "Dejaste tu primera reseña de cierre.", "You left your first closing review.", "Deixaches a túa primeira reseña de peche."), reached: (s) => s.reviews >= 1 },
  { id: "first_axes", icon: "timeline", label: (l) => pick(l, "Afinador", "Fine-tuner", "Afinador"), desc: (l) => pick(l, "Tu primera valoración con ejes: afinas el debate.", "Your first rating with axes: you sharpen the debate.", "A túa primeira valoración con eixes."), reached: (s) => s.axesBooks >= 1 },
  { id: "reader_5", icon: "book", label: (l) => pick(l, "Lector del club", "Club reader", "Lector do club"), desc: (l) => pick(l, "Cinco libros terminados juntos.", "Five books finished together.", "Cinco libros rematados xuntos."), reached: (s) => s.finished >= 5 },
  { id: "mapper_5", icon: "star", label: (l) => pick(l, "Cartógrafo del club", "Club cartographer", "Cartógrafo do club"), desc: (l) => pick(l, "Cinco valoraciones con ejes: das mapa al debate.", "Five ratings with axes: you map the debate.", "Cinco valoracións con eixes."), reached: (s) => s.axesBooks >= 5 }
];

export const computeBadges = (books: UserProfileBook[]): { earned: Badge[]; next: Badge | null } => {
  const s = badgeStats(books);
  const earned = BADGES.filter((b) => b.reached(s));
  const next = BADGES.find((b) => !b.reached(s)) ?? null;
  return { earned, next };
};
