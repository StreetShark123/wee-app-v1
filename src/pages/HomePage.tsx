import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookCard } from "../components/BookCard";
import { BookGridSkeleton } from "../components/Skeletons";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { pick, useI18n } from "../lib/i18n";
import type { ClubBook, MemberBook } from "../lib/communityApi";
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

  const isLater = (book: (typeof books)[number]): boolean =>
    book.status === "proposed" && !!book.votes && book.votes.later > 0 && book.votes.later >= book.votes.yes && book.votes.later >= book.votes.no;
  const reading = visibleBooks.filter((book) => book.status === "reading").sort((a, b) => featuredRank(a) - featuredRank(b));
  const proposed = visibleBooks.filter((book) => book.status === "proposed" && !isLater(book));
  const later = visibleBooks.filter(isLater);
  const finished = visibleBooks.filter((book) => book.status === "finished");

  const renderShelf = (title: string, list: typeof books, emptyHint: string) =>
    list.length === 0 ? (
      <div className="shelf-empty-row">
        <span className="shelf-empty-title">{title}</span>
        <span className="shelf-empty-hint">{emptyHint}</span>
      </div>
    ) : (
      <section className="page-section shelf-section">
        <div className="shelf-head">
          <h3 className="shelf-title">{title}</h3>
          <span className="shelf-count">{list.length}</span>
        </div>
        <div className="book-grid">
          {list.map((book) => (
            <BookCard key={book.id} book={book} member={memberByBookId.get(book.id)} onOpen={(entry) => navigate(`/book/${entry.id}`)} />
          ))}
        </div>
      </section>
    );

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenAddBook} onLogout={onLogout} />

      {showOnboarding ? (
        <section className="page-section onboarding-card">
          <div className="section-head">
            <h2><Icon name="spark" /> {pick(language, "Bienvenido al club", "Welcome to the club", "Benvido ao club")}</h2>
            <button type="button" className="btn" onClick={closeOnboarding}>{pick(language, "Vamos", "Let's go", "Imos")}</button>
          </div>
          <ol className="onboarding-list">
            <li>{pick(language, "Propón un libro y el club vota si lo leéis.", "Propose a book and the club votes to read it.", "Propón un libro e o club vota se o ledes.")}</li>
            <li>{pick(language, "Sigue tu avance por capítulos y añade notas.", "Track your chapter progress and add notes.", "Segue o teu avance por capítulos e engade notas.")}</li>
            <li>{pick(language, "Cuando todos lo terminan, pasa a 'leídos'.", "When everyone finishes, it moves to 'read'.", "Cando todos rematan, pasa a 'lidos'.")}</li>
          </ol>
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
          </div>
        </div>

        {booksLoading && books.length === 0 ? (
          <section className="page-section shelf-section">
            <div className="shelf-head"><span className="sk sk-line sk-shelf-title" /></div>
            <BookGridSkeleton />
          </section>
        ) : books.length === 0 ? (
          <article className="page-section empty-state">
            <h3>{pick(language, "La estantería está vacía", "The shelf is empty", "A estantería está baleira")}</h3>
            <p>{pick(language, "Propón el primer libro y votad si lo leéis.", "Propose the first book and vote to read it together.", "Propón o primeiro libro e votade se o ledes.")}</p>
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
              pick(language, "Aún nada en lectura. Aprobad una propuesta para empezar.", "Nothing being read yet. Approve a proposal to start.", "Aínda nada en lectura. Aprobade unha proposta.")
            )}
            {renderShelf(
              pick(language, "Propuestas", "Proposals", "Propostas"),
              proposed,
              pick(language, "Sin propuestas. Añade un libro y votad.", "No proposals. Add a book and vote.", "Sen propostas. Engade un libro e votade.")
            )}
            {later.length > 0
              ? renderShelf(pick(language, "Para más adelante", "For later", "Para máis adiante"), later, "")
              : null}
            {renderShelf(
              pick(language, "Leídos", "Read", "Lidos"),
              finished,
              pick(language, "Todavía no habéis terminado ningún libro juntos.", "You haven't finished a book together yet.", "Aínda non rematastes ningún libro xuntos.")
            )}
          </>
        )}
      </div>
    </main>
  );
};
