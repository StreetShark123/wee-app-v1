import { memo } from "react";
import type { PersonalBook } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { GeneratedCover } from "./GeneratedCover";
import { Icon } from "./Icon";

// Tarjeta de la biblioteca PERSONAL — versión simplificada de BookCard (sin
// votos, sin estado de club): solo portada, título, autor y las acciones que
// tienen sentido a título individual.
interface PersonalBookCardProps {
  book: PersonalBook;
  onSetShelf: (bookId: string, shelf: PersonalBook["shelf"]) => void;
  onPropose: (bookId: string) => void;
  onRemove: (bookId: string) => void;
  busy?: boolean;
}

export const PersonalBookCard = memo(({ book, onSetShelf, onPropose, onRemove, busy }: PersonalBookCardProps) => {
  const { language } = useI18n();
  return (
    <div className="personal-book-card">
      {book.coverUrl ? (
        <img className="personal-book-cover" src={book.coverUrl} alt="" loading="lazy" />
      ) : (
        <GeneratedCover className="personal-book-cover" title={book.title} author={book.author} />
      )}
      <div className="personal-book-body">
        <strong className="personal-book-title">{book.title}</strong>
        <span className="personal-book-author">{book.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}</span>
        <div className="personal-book-actions">
          {book.shelf !== "want" ? (
            <button type="button" className="btn btn-tiny" disabled={busy} onClick={() => onSetShelf(book.id, "want")}>
              {pick(language, "Quiero leer", "Want to read", "Quero ler")}
            </button>
          ) : null}
          {book.shelf !== "reading" ? (
            <button type="button" className="btn btn-tiny" disabled={busy} onClick={() => onSetShelf(book.id, "reading")}>
              {pick(language, "Leyendo", "Reading", "Lendo")}
            </button>
          ) : null}
          {book.shelf !== "read" ? (
            <button type="button" className="btn btn-tiny" disabled={busy} onClick={() => onSetShelf(book.id, "read")}>
              <Icon name="check" size={12} /> {pick(language, "Leído", "Read", "Lido")}
            </button>
          ) : null}
          <button type="button" className="btn btn-tiny" disabled={busy} onClick={() => onPropose(book.id)} title={pick(language, "Proponer este libro al club", "Propose this book to the club", "Propoñer este libro ao club")}>
            <Icon name="users" size={12} /> {pick(language, "Proponer al club", "Propose to club", "Propoñer ao club")}
          </button>
          <button type="button" className="btn btn-tiny btn-tiny-danger" disabled={busy} onClick={() => onRemove(book.id)}>
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
});
PersonalBookCard.displayName = "PersonalBookCard";
