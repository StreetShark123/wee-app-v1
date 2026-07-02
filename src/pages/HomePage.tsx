import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { BookCard } from "../components/BookCard";
import { BookGridSkeleton } from "../components/Skeletons";
import { Icon } from "../components/Icon";
import { UserBadge } from "../components/UserBadge";
import { TopBar } from "../components/TopBar";
import { pick, useI18n } from "../lib/i18n";
import { communityActivity, type ActivityEvent, type ClubBook, type MemberBook } from "../lib/communityApi";
import { timeAgo as timeAgoIntl } from "../lib/timeAgo";
import type { User } from "../lib/types";

interface HomePageProps {
  activeUser: User;
  books: ClubBook[];
  memberBooks: MemberBook[];
  booksLoading: boolean;
  onOpenAddBook: () => void;
  onLogout: () => void;
}

const matchesQuery = (book: ClubBook, query: string): boolean => {
  if (!query) return true;
  const haystack = `${book.title} ${book.author ?? ""}`.toLowerCase();
  return haystack.includes(query);
};

// Caché stale-while-revalidate de la tira "Lo último": la red (más el arranque en
// frío de la edge function) tarda; con esto la tira pinta al instante al volver a
// la home y se refresca detrás.
const ACTIVITY_CACHE_KEY = "wee:activity";
const readCachedActivity = (userId: string): ActivityEvent[] => {
  try {
    const raw = localStorage.getItem(ACTIVITY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { key: string; events: ActivityEvent[] };
    return parsed && parsed.key === userId && Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
};
const writeCachedActivity = (userId: string, events: ActivityEvent[]): void => {
  try {
    localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify({ key: userId, events }));
  } catch {
    // Storage lleno o bloqueado: sin caché, la tira seguirá llegando por red.
  }
};

export const HomePage = ({
  activeUser,
  books,
  memberBooks,
  booksLoading,
  onOpenAddBook,
  onLogout
}: HomePageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>(() => readCachedActivity(activeUser.id));
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [activityIdx, setActivityIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    const hadCached = activity.length > 0;
    void communityActivity()
      .then(({ events }) => {
        if (!alive) return;
        setActivity(events);
        setActivityIdx(0);
        writeCachedActivity(activeUser.id, events);
        // La tira se inserta arriba de forma asíncrona; sin esto el "scroll
        // anchoring" del navegador la empuja bajo el header al entrar en la home.
        // Con caché ya pintada no hace falta (y evitamos un salto de scroll).
        if (events.length > 0 && !hadCached) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      })
      .catch(() => { /* deja lo cacheado si la red falla */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de usuario
  }, [activeUser.id]);

  // Destino de un evento: los comentarios saltan al comentario concreto (#c-…);
  // el resto, al libro.
  const activityHref = (ev: ActivityEvent): string =>
    ev.kind === "comment" && ev.commentId ? `/book/${ev.bookId}#c-${ev.commentId}` : `/book/${ev.bookId}`;

  // La tira rota entre los eventos cada 4 s (pausada al expandir).
  useEffect(() => {
    if (activityExpanded || activity.length <= 1) return;
    const id = window.setInterval(() => setActivityIdx((i) => (i + 1) % activity.length), 4000);
    return () => window.clearInterval(id);
  }, [activityExpanded, activity.length]);

  const activityLine = (ev: ActivityEvent): string =>
    ev.kind === "comment" ? pick(language, `comentó en «${ev.bookTitle}»`, `commented on “${ev.bookTitle}”`, `comentou en «${ev.bookTitle}»`)
      : ev.kind === "note" ? pick(language, `anotó en «${ev.bookTitle}»`, `annotated “${ev.bookTitle}”`, `anotou en «${ev.bookTitle}»`)
        : ev.kind === "read" ? pick(language, `leyó un capítulo de «${ev.bookTitle}»`, `read a chapter of “${ev.bookTitle}”`, `leu un capítulo de «${ev.bookTitle}»`)
          : pick(language, `propuso «${ev.bookTitle}»`, `proposed “${ev.bookTitle}”`, `propuxo «${ev.bookTitle}»`);

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
      <TopBar user={activeUser} onOpenShare={onOpenAddBook} onLogout={onLogout} />

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

      {activity.length > 0 ? (
        <section className="activity-feed">
          <button type="button" className="activity-ticker" onClick={() => setActivityExpanded((v) => !v)} aria-expanded={activityExpanded}>
            <span className="activity-ticker-label"><Icon name="spark" size={13} /> {pick(language, "Lo último", "Latest", "O último")}</span>
            {!activityExpanded && activity[activityIdx] ? (
              <span className="activity-ticker-now" key={activityIdx}>
                <UserBadge alias={activity[activityIdx].actorAlias} avatarUrl={activity[activityIdx].actorAvatarUrl ?? undefined} colorIndex={activity[activityIdx].actorColorIndex ?? undefined} withAvatar />
                <span className="activity-ticker-text">{activityLine(activity[activityIdx])}</span>
                <span className="activity-chip-time">{timeAgoIntl(activity[activityIdx].at, language)}</span>
              </span>
            ) : (
              <span className="activity-ticker-text">{pick(language, `${activity.length} novedades hoy`, `${activity.length} updates today`, `${activity.length} novidades hoxe`)}</span>
            )}
            <span className="activity-ticker-caret" aria-hidden="true">{activityExpanded ? "▴" : "▾"}</span>
          </button>
          {activityExpanded ? (
            <ul className="activity-expanded">
              {activity.map((ev, i) => (
                <li key={`${ev.bookId}-${ev.at}-${i}`}>
                  <button type="button" className="activity-row" onClick={() => navigate(activityHref(ev))}>
                    <UserBadge alias={ev.actorAlias} avatarUrl={ev.actorAvatarUrl ?? undefined} colorIndex={ev.actorColorIndex ?? undefined} withAvatar />
                    <span className="activity-ticker-text">{activityLine(ev)}</span>
                    <span className="activity-chip-time">{timeAgoIntl(ev.at, language)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="home-main home-books">
        <div className="books-hero">
          <h2 className="books-hero-title"><Icon name="book" /> {pick(language, "La estantería del club", "The club shelf", "A estantería do club")}</h2>
          <div className="books-hero-actions">
            <label className="books-hero-search" aria-label={pick(language, "Buscar libro", "Search book", "Buscar libro")}>
              <Icon name="search" size={13} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={pick(language, "Buscar...", "Search...", "Buscar...")}
              />
            </label>
            <button type="button" className="btn btn-primary" onClick={onOpenAddBook}>
              <Icon name="plus" size={14} /> {pick(language, "Añadir libro", "Add book", "Engadir libro")}
            </button>
            <button type="button" className="btn" onClick={() => setShowOnboarding(true)}>
              <Icon name="spark" size={13} /> {pick(language, "¿Cómo funciona?", "How it works", "Como funciona?")}
            </button>
          </div>
        </div>

        {booksLoading && books.length === 0 ? (
          // Skeleton en flujo (no overlay): tras el splash el usuario ya ve la
          // pantalla real (header + estantería), sin repetir otra carga completa.
          <BookGridSkeleton />
        ) : books.length === 0 ? (
          <article className="page-section empty-state">
            <h3>{pick(language, "La estantería está vacía", "The shelf is empty", "A estantería está baleira")}</h3>
            <p>{pick(language, "Propón el primer libro y vota si lo lees.", "Propose the first book and vote to read it together.", "Propón o primeiro libro e vota se o les.")}</p>
            <button type="button" className="btn btn-primary" onClick={onOpenAddBook}>
              <Icon name="plus" /> {pick(language, "Proponer un libro", "Propose a book", "Propoñer un libro")}
            </button>
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
