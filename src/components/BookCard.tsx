import { memo, useState } from "react";
import type { ClubBook, MemberBook } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { statusLabel } from "../lib/bookLabels";
import { GeneratedCover } from "./GeneratedCover";
import { Icon } from "./Icon";
import { UserDot } from "./UserBadge";

interface BookCardProps {
  book: ClubBook;
  member?: MemberBook;
  onOpen?: (book: ClubBook) => void;
  /** Alias de quien lo propuso, ya resuelto (para el reverso). */
  addedByAlias?: string;
  /** Si puede editar el libro (solo admin) — muestra el botón en el reverso. */
  canEdit?: boolean;
  onEdit?: (book: ClubBook) => void;
}

// Portada protagonista: la cara A es SOLO la portada (progreso + lectores
// integrados encima, sin texto suelto debajo). El botón "i" da la vuelta a la
// card (cara B) para ver título/autor/año/páginas/sinopsis/estado — así la
// cara A queda limpia y la portada manda.
export const BookCard = memo(({ book, member, onOpen, addedByAlias, canEdit, onEdit }: BookCardProps) => {
  const { language } = useI18n();
  const [flipped, setFlipped] = useState(false);
  // Indicador sutil de "tú lo estás leyendo" (sin texto redundante).
  const mine = !!member && (member.shelf === "reading" || member.shelf === "finished" || member.chaptersDone > 0);

  const progress = book.stats?.avgProgressPct ?? null;
  const readers = book.readersPreview ?? [];
  const visibleReaders = readers.slice(0, 5);
  const extraReaders = readers.length - visibleReaders.length;
  const showOverlay = progress != null || visibleReaders.length > 0;

  return (
    <div
      className={`book-card-flip${flipped ? " is-flipped" : ""}${book.status === "rejected" ? " book-card-rejected" : ""}${mine ? " book-card-mine" : ""}`}
    >
      <div className="book-card-flip-inner">
        {/* Cara A: la portada, protagonista. */}
        <div className="book-card-face book-card-face-front">
          {book.featured === "gold" ? (
            <span className="book-ribbon" aria-label={pick(language, "Lectura principal del club", "Club's main read", "Lectura principal do club")} title={pick(language, "Lectura principal", "Main read", "Lectura principal")} />
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

          <button
            type="button"
            className="book-card-cover-btn"
            onClick={() => onOpen?.(book)}
            aria-label={book.status === "rejected"
              ? pick(language, `${book.title} (propuesta descartada)`, `${book.title} (proposal declined)`, `${book.title} (proposta descartada)`)
              : mine ? pick(language, `${book.title} (lo estás leyendo)`, `${book.title} (you're reading it)`, `${book.title} (estalo a ler)`) : book.title}
          >
            {book.coverUrl ? (
              <img className="book-card-cover" src={book.coverUrl} alt="" loading="lazy" />
            ) : (
              <GeneratedCover className="book-card-cover" title={book.title} author={book.author} />
            )}
            {showOverlay ? (
              <span className="book-card-overlay">
                {progress != null ? (
                  <span className="book-card-progress-bar" aria-hidden="true"><span className="book-card-progress-fill" style={{ width: `${progress}%` }} /></span>
                ) : null}
                {visibleReaders.length > 0 ? (
                  <span className="book-card-readers-stack">
                    {visibleReaders.map((r) => (
                      <UserDot key={r.userId} alias={r.alias} avatarUrl={r.avatarUrl} colorIndex={r.colorIndex} done={r.done} />
                    ))}
                    {extraReaders > 0 ? <span className="book-card-readers-more">+{extraReaders}</span> : null}
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            className="book-card-flip-btn"
            onClick={(event) => { event.stopPropagation(); setFlipped(true); }}
            aria-label={pick(language, "Más información", "More information", "Máis información")}
            title={pick(language, "Más información", "More information", "Máis información")}
          >
            <Icon name="spark" size={13} />
          </button>
        </div>

        {/* Cara B: datos extendidos. */}
        <div className="book-card-face book-card-face-back">
          <button
            type="button"
            className="book-card-flip-btn book-card-flip-btn-back"
            onClick={(event) => { event.stopPropagation(); setFlipped(false); }}
            aria-label={pick(language, "Volver a la portada", "Back to the cover", "Volver á portada")}
            title={pick(language, "Volver", "Back", "Volver")}
          >
            <Icon name="arrowLeft" size={13} />
          </button>
          <div className="book-card-back-body">
            <span className={`book-card-status book-card-status-${book.status}`}>{statusLabel(book.status, language)}</span>
            <strong className="book-card-back-title">{book.title}</strong>
            <span className="book-card-back-author">{book.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}</span>
            {book.publishedYear || book.pageCount ? (
              <span className="book-card-back-meta">
                {[
                  book.publishedYear ? String(book.publishedYear) : null,
                  book.pageCount ? pick(language, `${book.pageCount} págs.`, `${book.pageCount} pp.`, `${book.pageCount} páxs.`) : null
                ].filter(Boolean).join(" · ")}
              </span>
            ) : null}
            {book.descriptionPreview ? <p className="book-card-back-desc">{book.descriptionPreview}…</p> : null}
            {addedByAlias ? (
              <span className="book-card-back-by">{pick(language, `Propuesto por ${addedByAlias}`, `Proposed by ${addedByAlias}`, `Proposto por ${addedByAlias}`)}</span>
            ) : null}
          </div>
          {canEdit ? (
            <button type="button" className="btn btn-tiny book-card-edit-btn" onClick={(event) => { event.stopPropagation(); onEdit?.(book); }}>
              <Icon name="pencil" size={12} /> {pick(language, "Editar", "Edit", "Editar")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
BookCard.displayName = "BookCard";
