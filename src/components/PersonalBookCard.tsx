import { memo } from "react";
import type { PersonalBook } from "../lib/communityApi";
import { BookCoverFace } from "./BookCoverFace";

// Tarjeta de la biblioteca PERSONAL — MISMA pinta que la del club (portada
// protagonista con progreso integrado), tappable → detalle. Cambia solo la
// intención: privada (tu lectura), no pública (el club).
interface PersonalBookCardProps {
  book: PersonalBook;
  onOpen: (bookId: string) => void;
}

export const PersonalBookCard = memo(({ book, onOpen }: PersonalBookCardProps) => {
  const total = book.chapters.length;
  const pct = total > 0 ? Math.round((book.chaptersDone.length / total) * 100) : null;
  return (
    <button type="button" className="book-card" onClick={() => onOpen(book.id)} aria-label={book.title}>
      <BookCoverFace coverUrl={book.coverUrl} title={book.title} author={book.author} progressPct={pct} readers={[]} />
    </button>
  );
});
PersonalBookCard.displayName = "PersonalBookCard";
