import { memo, type ReactNode } from "react";
import type { ClubBook, MemberBook } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

interface BookCardProps {
  book: ClubBook;
  member?: MemberBook;
  onOpen?: (book: ClubBook) => void;
}

const timeAgo = (ms: number, language: "es" | "en" | "gl"): string => {
  const day = 86400000;
  const diff = Date.now() - ms;
  if (diff < day) return pick(language, "hoy", "today", "hoxe");
  const days = Math.floor(diff / day);
  if (days < 7) return pick(language, `hace ${days} d`, `${days}d ago`, `hai ${days} d`);
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return pick(language, `hace ${weeks} sem`, `${weeks}w ago`, `hai ${weeks} sem`);
  const months = Math.max(1, Math.floor(days / 30));
  return pick(language, `hace ${months} mes`, `${months}mo ago`, `hai ${months} mes`);
};

export const BookCard = memo(({ book, member, onOpen }: BookCardProps) => {
  const { language } = useI18n();
  // Indicador sutil de "tú lo estás leyendo" (sin texto redundante).
  const mine = !!member && (member.shelf === "reading" || member.shelf === "finished" || member.chaptersDone > 0);

  const flagLabel = book.featured === "gold" ? pick(language, "Principal", "Main read", "Principal") : null;

  // A1: dato según estantería. Leídos → nota media; En lectura → lectores + última actividad.
  let statLine: ReactNode = null;
  const st = book.stats;
  if (book.status === "finished" && st && st.avgRating != null) {
    statLine = (
      <span className="book-card-stat">
        <span className="book-card-rating">★ {st.avgRating}</span>
        <span className="book-card-stat-sub">· {st.ratingCount} {pick(language, "votos", "ratings", "votos")}</span>
      </span>
    );
  } else if (book.status === "reading" && st) {
    statLine = (
      <span className="book-card-stat">
        <Icon name="users" size={11} /> {st.readers} {pick(language, "leyendo", "reading", "lendo")}
        {st.lastActivityAt ? <span className="book-card-stat-sub">· {timeAgo(st.lastActivityAt, language)}</span> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`book-card${book.featured === "gold" ? " book-card-featured-gold" : ""}${mine ? " book-card-mine" : ""}`}
      onClick={() => onOpen?.(book)}
      aria-label={mine ? pick(language, `${book.title} (lo estás leyendo)`, `${book.title} (you're reading it)`, `${book.title} (estalo a ler)`) : book.title}
    >
      {flagLabel ? <span className="book-flag book-flag-gold">{flagLabel}</span> : null}
      {book.status === "proposed" && book.votes && book.votes.yes > 0 ? (
        <span className="book-vote-badge"><Icon name="check" size={11} /> {book.votes.yes}</span>
      ) : null}
      {book.coverUrl ? (
        <img className="book-card-cover" src={book.coverUrl} alt="" loading="lazy" />
      ) : (
        <span className="book-card-cover book-card-cover-empty" aria-hidden="true">
          <Icon name="book" />
        </span>
      )}
      <span className="book-card-body">
        <strong className="book-card-title">{book.title}</strong>
        <span className="book-card-author">
          {book.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}
        </span>
        {statLine}
      </span>
    </button>
  );
});
BookCard.displayName = "BookCard";
