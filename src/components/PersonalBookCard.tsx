import { memo } from "react";
import type { PersonalBook } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { GeneratedCover } from "./GeneratedCover";

// Tarjeta de la biblioteca PERSONAL — como la del club: tappable → detalle.
// Las acciones (estantería, capítulos, proponer, quitar) viven en el detalle.
interface PersonalBookCardProps {
  book: PersonalBook;
  onOpen: (bookId: string) => void;
}

export const PersonalBookCard = memo(({ book, onOpen }: PersonalBookCardProps) => {
  const { language } = useI18n();
  const total = book.chapters.length;
  const done = book.chaptersDone.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <button type="button" className="personal-book-card" onClick={() => onOpen(book.id)}>
      {book.coverUrl ? (
        <img className="personal-book-cover" src={book.coverUrl} alt="" loading="lazy" />
      ) : (
        <GeneratedCover className="personal-book-cover" title={book.title} author={book.author} />
      )}
      <span className="personal-book-body">
        <strong className="personal-book-title">{book.title}</strong>
        <span className="personal-book-author">{book.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}</span>
        {total > 0 ? (
          <span className="personal-book-progress">
            <span className="personal-book-progress-bar" aria-hidden="true"><span className="personal-book-progress-fill" style={{ width: `${pct}%` }} /></span>
            <span className="personal-book-progress-label">{done}/{total}</span>
          </span>
        ) : null}
      </span>
      <span className="personal-book-go" aria-hidden="true">›</span>
    </button>
  );
});
PersonalBookCard.displayName = "PersonalBookCard";
