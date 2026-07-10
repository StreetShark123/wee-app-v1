import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { BookCard } from "../components/BookCard";
import { BookGridSkeleton } from "../components/Skeletons";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import type { ClubBook, MemberBook } from "../lib/communityApi";
import type { User } from "../lib/types";

interface HomePageProps {
  activeUser: User;
  books: ClubBook[];
  memberBooks: MemberBook[];
  booksLoading: boolean;
  /** false si el club es "solo admins añaden libros" y no eres admin */
  canAddBook: boolean;
  onOpenAddBook: () => void;
  onLogout: () => void;
}

const matchesQuery = (book: ClubBook, query: string): boolean => {
  if (!query) return true;
  const haystack = `${book.title} ${book.author ?? ""}`.toLowerCase();
  return haystack.includes(query);
};

export const HomePage = ({
  activeUser,
  books,
  memberBooks,
  booksLoading,
  canAddBook,
  onOpenAddBook,
  onLogout
}: HomePageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim().toLowerCase()), 180);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const key = `wee_onboarding_seen_${activeUser.id}`;
    setShowOnboarding(!localStorage.getItem(key));
  }, [activeUser.id]);

  const memberByBookId = useMemo(
    () => new Map(memberBooks.map((entry) => [entry.bookId, entry])),
    [memberBooks]
  );

  const openBook = useCallback((entry: ClubBook) => navigate(`/book/${entry.id}`), [navigate]);

  const featuredRank = (book: (typeof books)[number]): number =>
    book.featured === "gold" ? 0 : book.featured === "silver" ? 1 : 2;
  const visibleBooks = useMemo(
    () =>
      books
        .filter((book) => matchesQuery(book, debouncedSearchQuery))
        .sort((a, b) => featuredRank(a) - featuredRank(b)),
    [books, debouncedSearchQuery]
  );

  const closeOnboarding = (): void => {
    localStorage.setItem(`wee_onboarding_seen_${activeUser.id}`, "1");
    setShowOnboarding(false);
  };

  const reading = visibleBooks.filter((book) => book.status === "reading").sort((a, b) => featuredRank(a) - featuredRank(b));
  // Propuestas (pendientes de voto) primero, luego rechazadas; cada grupo cronológico
  // (más recientes arriba). Es la "columna" de propuestas de la librería.
  const proposals = visibleBooks
    .filter((book) => book.status === "proposed" || book.status === "rejected")
    .sort((a, b) => {
      const rank = (s: string) => (s === "proposed" ? 0 : 1);
      return rank(a.status) - rank(b.status) || b.createdAt - a.createdAt;
    });
  const finished = visibleBooks.filter((book) => book.status === "finished");

  const renderShelf = (title: string, list: typeof books, emptyHint: string, variant = "") =>
    list.length === 0 ? (
      <div className={`shelf-empty-row shelf-${variant}`}>
        <span className="shelf-empty-title">{title}</span>
        <span className="shelf-empty-hint">{emptyHint}</span>
      </div>
    ) : (
      <section className={`page-section shelf-section shelf-${variant}`}>
        <div className="shelf-head">
          <h3 className="shelf-title">{title}</h3>
          <span className="shelf-count">{list.length}</span>
        </div>
        <div className="book-grid">
          {list.map((book) => (
            <BookCard key={book.id} book={book} member={memberByBookId.get(book.id)} onOpen={openBook} />
          ))}
        </div>
      </section>
    );

  return (
    <main>
      {showOnboarding ? createPortal(
        <div className="readers-modal-overlay" role="dialog" aria-modal="true" onClick={closeOnboarding}>
          <div className="readers-modal onboarding-modal" onClick={(e) => e.stopPropagation()}>
            <div className="readers-modal-head">
              <h3><Icon name="spark" /> {pick(language, "¿Cómo funciona?", "How it works", "Como funciona?")}</h3>
              <button type="button" className="btn btn-icon-compact" onClick={closeOnboarding} aria-label={pick(language, "Cerrar", "Close", "Pechar")}>
                <Icon name="x" size={16} />
              </button>
            </div>
          <ol className="onboarding-list">
            <li>{pick(language, "Propón un libro y el club vota si lo leéis.", "Propose a book and the club votes to read it.", "Propón un libro e o club vota se o ledes.")}</li>
            <li>{pick(language, "Sigue tu avance por capítulos y añade notas.", "Track your chapter progress and add notes.", "Segue o teu avance por capítulos e engade notas.")}</li>
            <li>{pick(language, "Cuando todos lo terminan, pasa a 'leídos'.", "When everyone finishes, it moves to 'read'.", "Cando todos rematan, pasa a 'lidos'.")}</li>
          </ol>
          <dl className="onboarding-glossary">
            <dt>{pick(language, "Propuesta", "Proposal", "Proposta")}</dt>
            <dd>{pick(language, "un libro que aún estáis votando.", "a book the club is still voting on.", "un libro que o club aínda está votando se ler.")}</dd>
            <dt>{pick(language, "Quórum", "Quorum", "Quórum")}</dt>
            <dd>{pick(language, "Los votos mínimos para decidir. Al llegar, gana la mayoría.", "the minimum votes (either way) to decide; once reached, the majority wins.", "os votos mínimos (de calquera signo) para decidir; cando se chega, gaña a maioría.")}</dd>
            <dt>{pick(language, "En lectura", "Reading", "En lectura")}</dt>
            <dd>{pick(language, "el libro que leéis ahora, capítulo a capítulo.", "the approved book the club is reading now, chapter by chapter.", "o libro aprobado que o club le agora, capítulo a capítulo.")}</dd>
          </dl>
            <button type="button" className="btn btn-primary onboarding-modal-done" onClick={closeOnboarding}>{pick(language, "Entendido", "Got it", "Entendido")}</button>
          </div>
        </div>,
        document.body
      ) : null}

      <div className="home-main home-books">
        {/* Masthead: fila de título (+ ayuda discreta) y fila de acciones con el
            buscador a todo el ancho disponible (antes quedaba aplastado a "B..."). */}
        <div className="books-hero">
          <div className="books-hero-masthead">
            <h2 className="books-hero-title"><Icon name="book" /> {pick(language, "La estantería del club", "The club shelf", "A estantería do club")}</h2>
            <button
              type="button"
              className="btn btn-icon-compact books-hero-help"
              onClick={() => setShowOnboarding(true)}
              aria-label={pick(language, "¿Cómo funciona?", "How it works", "Como funciona?")}
              title={pick(language, "¿Cómo funciona?", "How it works", "Como funciona?")}
            >
              <Icon name="spark" size={14} />
            </button>
          </div>
          <div className="books-hero-actions">
            <label className="books-hero-search" aria-label={pick(language, "Buscar libro", "Search book", "Buscar libro")}>
              <Icon name="search" size={13} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={pick(language, "Buscar en la estantería...", "Search the shelf...", "Buscar na estantería...")}
              />
            </label>
            {canAddBook ? (
              <button type="button" className="btn btn-primary books-hero-add" onClick={onOpenAddBook}>
                <Icon name="plus" size={14} /> {pick(language, "Añadir libro", "Add book", "Engadir libro")}
              </button>
            ) : null}
          </div>
        </div>

        {booksLoading && books.length === 0 ? (
          // Skeleton en flujo (no overlay): tras el splash el usuario ya ve la
          // pantalla real (header + estantería), sin repetir otra carga completa.
          <BookGridSkeleton />
        ) : books.length === 0 ? (
          <article className="page-section empty-state">
            <h3>{pick(language, "La estantería está vacía", "The shelf is empty", "A estantería está baleira")}</h3>
            {canAddBook ? (
              <>
                <p>{pick(language, "Propón el primer libro y vota si lo lees.", "Propose the first book and vote to read it together.", "Propón o primeiro libro e vota se o les.")}</p>
                <button type="button" className="btn btn-primary" onClick={onOpenAddBook}>
                  <Icon name="plus" /> {pick(language, "Proponer un libro", "Propose a book", "Propoñer un libro")}
                </button>
              </>
            ) : (
              <p>{pick(language, "En este club solo los administradores proponen libros. Espera a que aparezca el primero.", "In this club only admins propose books. Hang tight for the first one.", "Neste club só os administradores propoñen libros. Agarda ao primeiro.")}</p>
            )}
          </article>
        ) : visibleBooks.length === 0 ? (
          <p className="hint">{pick(language, "Ningún libro coincide con la búsqueda.", "No book matches your search.", "Ningún libro coincide coa busca.")}</p>
        ) : (
          <>
            {renderShelf(
              pick(language, "En lectura", "Reading now", "En lectura"),
              reading,
              pick(language, "Aún nada en lectura. Aprobad una propuesta para empezar.", "Nothing being read yet. Approve a proposal to start.", "Aínda nada en lectura. Aprobade unha proposta."),
              "reading"
            )}
            {renderShelf(
              pick(language, "Propuestas", "Proposals", "Propostas"),
              proposals,
              pick(language, "Sin propuestas. Añade un libro y votad.", "No proposals. Add a book and vote.", "Sen propostas. Engade un libro e votade."),
              "proposed"
            )}
            {renderShelf(
              pick(language, "Leídos", "Read", "Lidos"),
              finished,
              pick(language, "Aún no habéis terminado ningún libro.", "You haven't finished a book together yet.", "Aínda non rematastes ningún libro xuntos."),
              "finished"
            )}
          </>
        )}
      </div>
    </main>
  );
};
