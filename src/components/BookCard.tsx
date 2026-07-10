import { memo } from "react";
import type { ClubBook, MemberBook } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { BookCoverFace } from "./BookCoverFace";
import { Icon } from "./Icon";

interface BookCardProps {
  book: ClubBook;
  member?: MemberBook;
  onOpen?: (book: ClubBook) => void;
}

// Tarjeta de la estantería: ESTÁTICA — solo la portada, con progreso de lectura
// y avatares de lectores integrados encima (vía BookCoverFace). Tocarla abre la
// ficha completa, donde vive el flip a los datos extendidos. Antes tenía flip
// aquí; se quitó para que la biblioteca sea de hojeo rápido y el header pesado
// de metadatos solo aparezca (plegado) al entrar en cada libro.
export const BookCard = memo(({ book, member, onOpen }: BookCardProps) => {
  const { language } = useI18n();
  const mine = !!member && (member.shelf === "reading" || member.shelf === "finished" || member.chaptersDone > 0);

  return (
    <button
      type="button"
      className={`book-card${book.status === "rejected" ? " book-card-rejected" : ""}${mine ? " book-card-mine" : ""}`}
      onClick={() => onOpen?.(book)}
      aria-label={book.status === "rejected"
        ? pick(language, `${book.title} (propuesta descartada)`, `${book.title} (proposal declined)`, `${book.title} (proposta descartada)`)
        : mine ? pick(language, `${book.title} (lo estás leyendo)`, `${book.title} (you're reading it)`, `${book.title} (estalo a ler)`) : book.title}
    >
      {book.featured === "gold" ? (
        <span className="book-ribbon" aria-hidden="true" title={pick(language, "Lectura principal", "Main read", "Lectura principal")} />
      ) : null}
      {book.status === "proposed" ? (
        <span className="book-vote-badge" title={pick(language, "Necesita tu voto", "Needs your vote", "Precisa o teu voto")}>
          <Icon name="check" size={11} /> {book.votes?.yes ?? 0}
          {book.votes && book.votes.no > 0 ? <span className="book-vote-badge-no"> · {book.votes.no} {pick(language, "no", "no", "non")}</span> : null}
        </span>
      ) : null}
      {book.status === "rejected" ? (
        <span className="book-card-rejected-tag">{pick(language, "descartado", "declined", "descartado")}</span>
      ) : null}
      <BookCoverFace
        coverUrl={book.coverUrl}
        title={book.title}
        author={book.author}
        progressPct={book.stats?.avgProgressPct ?? null}
        readers={book.readersPreview ?? []}
      />
    </button>
  );
});
BookCard.displayName = "BookCard";
