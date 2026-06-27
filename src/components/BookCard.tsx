import type { ClubBook, MemberBook } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

interface BookCardProps {
  book: ClubBook;
  member?: MemberBook;
  onOpen?: (book: ClubBook) => void;
}

const statusLabel = (status: ClubBook["status"], language: "es" | "en" | "gl"): string => {
  switch (status) {
    case "reading":
      return pick(language, "En lectura", "Reading", "En lectura");
    case "finished":
      return pick(language, "Leído", "Read", "Lido");
    default:
      return pick(language, "Propuesto", "Proposed", "Proposto");
  }
};

export const BookCard = ({ book, member, onOpen }: BookCardProps) => {
  const { language } = useI18n();
  const onShelf = member ? pick(language, "En tu estante", "On your shelf", "No teu estante") : null;

  const flagLabel = book.featured === "gold" ? pick(language, "Principal", "Main read", "Principal") : null;

  return (
    <button
      type="button"
      className={`book-card${book.featured === "gold" ? " book-card-featured-gold" : ""}`}
      onClick={() => onOpen?.(book)}
      aria-label={book.title}
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
        <span className={`book-card-status book-card-status-${book.status}`}>
          {statusLabel(book.status, language)}
        </span>
        <strong className="book-card-title">{book.title}</strong>
        <span className="book-card-author">
          {book.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}
        </span>
        {onShelf ? <span className="book-card-shelf">{onShelf}</span> : null}
      </span>
    </button>
  );
};
