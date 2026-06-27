import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookCard } from "../components/BookCard";
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

  const reading = visibleBooks.filter((book) => book.status === "reading").sort((a, b) => featuredRank(a) - featuredRank(b));
  const proposed = visibleBooks.filter((book) => book.status === "proposed");
  const finished = visibleBooks.filter((book) => book.status === "finished");

  const renderShelf = (title: string, list: typeof books) => (
    <div className="shelf">
      <h3 className="shelf-title">{title} <span className="shelf-count">{list.length}</span></h3>
      <div className="book-grid">
        {list.map((book) => (
          <BookCard key={book.id} book={book} member={memberByBookId.get(book.id)} onOpen={(entry) => navigate(`/book/${entry.id}`)} />
        ))}
      </div>
    </div>
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
            <li>{pick(language, "Añade un libro y aparece en la estantería del club.", "Add a book and it shows up on the club shelf.", "Engade un libro e aparece na estantería do club.")}</li>
            <li>{pick(language, "Comenta y sigue tu avance por capítulos.", "Comment and track your chapter progress.", "Comenta e segue o teu avance por capítulos.")}</li>
            <li>{pick(language, "Cuando todos lo terminan, queda como leído.", "When everyone finishes, it's marked as read.", "Cando todos rematan, queda como lido.")}</li>
          </ol>
        </section>
      ) : null}

      <div className="home-main home-books">
        <section className="page-section section-latest" id="feed-section">
          <div className="section-head">
            <h2><Icon name="book" /> {pick(language, "La estantería del club", "The club shelf", "A estantería do club")}</h2>
            <button type="button" className="btn btn-primary" onClick={onOpenAddBook}>
              <Icon name="plus" size={14} /> {pick(language, "Añadir libro", "Add book", "Engadir libro")}
            </button>
          </div>

          <label className="home-sidebar-search" aria-label={pick(language, "Buscar libro", "Search book", "Buscar libro")}>
            <Icon name="search" size={13} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={pick(language, "Buscar por título o autor...", "Search by title or author...", "Buscar por título ou autor...")}
            />
          </label>

          {booksLoading && books.length === 0 ? (
            <p className="hint">{pick(language, "Cargando la estantería", "Loading the shelf", "Cargando a estantería")}<span className="loading-dots" aria-hidden="true" /></p>
          ) : books.length === 0 ? (
            <article className="empty-state">
              <h3>{pick(language, "La estantería está vacía", "The shelf is empty", "A estantería está baleira")}</h3>
              <p>{pick(language, "Propón el primer libro y votad si lo leéis.", "Propose the first book and vote to read it together.", "Propón o primeiro libro e votade se o ledes.")}</p>
              <button type="button" className="btn btn-primary" onClick={onOpenAddBook}>
                <Icon name="plus" /> {pick(language, "Proponer un libro", "Propose a book", "Propoñer un libro")}
              </button>
            </article>
          ) : visibleBooks.length === 0 ? (
            <p className="hint">{pick(language, "Ningún libro coincide con la búsqueda.", "No book matches your search.", "Ningún libro coincide coa busca.")}</p>
          ) : (
            <div className="shelves">
              {reading.length > 0 ? renderShelf(pick(language, "En lectura", "Reading now", "En lectura"), reading) : null}
              {proposed.length > 0 ? renderShelf(pick(language, "Propuestas", "Proposals", "Propostas"), proposed) : null}
              {finished.length > 0 ? renderShelf(pick(language, "Leídos", "Read", "Lidos"), finished) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
