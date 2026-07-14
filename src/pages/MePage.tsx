import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AddBookModal } from "../components/AddBookModal";
import { Icon } from "../components/Icon";
import { PersonalBookCard } from "../components/PersonalBookCard";
import { BookGridSkeleton } from "../components/Skeletons";
import { pick, useI18n } from "../lib/i18n";
import type { BookDraft } from "../lib/bookSearch";
import {
  addToPersonalLibrary,
  listPersonalLibrary,
  type PersonalBook,
  type PersonalShelf
} from "../lib/communityApi";
// "Tú": tu biblioteca personal — MISMA vista que la estantería del club (mismos
// assets, distribución, cards), cambia solo la intención: PRIVADA (tu lectura),
// no pública. Los libros abren su detalle (seguimiento de capítulos, sin social).
interface MePageProps {
  onToast: (message: string) => void;
}

// Mismo orden que la estantería del club; variante de color reutilizada
// (reading=menta, read=violeta; want sin color, como neutro).
const SHELVES: { key: PersonalShelf; variant: string; label: (l: "es" | "en" | "gl") => string; empty: (l: "es" | "en" | "gl") => string }[] = [
  { key: "reading", variant: "reading", label: (l) => pick(l, "Leyendo ahora", "Reading now", "Lendo agora"), empty: (l) => pick(l, "Nada en marcha ahora mismo.", "Nothing in progress right now.", "Nada en marcha agora mesmo.") },
  { key: "want", variant: "", label: (l) => pick(l, "Quiero leer", "Want to read", "Quero ler"), empty: (l) => pick(l, "Sin pendientes por ahora.", "Nothing on the wishlist yet.", "Sen pendentes por agora.") },
  { key: "read", variant: "finished", label: (l) => pick(l, "Leídos", "Read", "Lidos"), empty: (l) => pick(l, "Aún no has terminado ninguno.", "You haven't finished any yet.", "Aínda non remataches ningún.") }
];

const matches = (book: PersonalBook, query: string): boolean => {
  if (!query) return true;
  return `${book.title} ${book.author ?? ""}`.toLowerCase().includes(query);
};

export const MePage = ({ onToast }: MePageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [books, setBooks] = useState<PersonalBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const load = useCallback(() => {
    void listPersonalLibrary()
      .then((r) => setBooks(r.books))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // El detalle de un libro personal avisa al cambiar estantería/capítulos/quitar.
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("wee:personal-refresh", onRefresh);
    return () => window.removeEventListener("wee:personal-refresh", onRefresh);
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 180);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const visible = useMemo(() => books.filter((b) => matches(b, debouncedQuery)), [books, debouncedQuery]);

  const handleAddBook = async (draft: BookDraft): Promise<void> => {
    const { book } = await addToPersonalLibrary({
      isbn: draft.isbn,
      title: draft.title,
      author: draft.author,
      coverUrl: draft.coverUrl,
      description: draft.description,
      publishedYear: draft.publishedYear,
      pageCount: draft.pageCount,
      source: draft.source,
      manuallyEdited: draft.manuallyEdited
    });
    setBooks((prev) => [book, ...prev]);
    onToast(pick(language, "Añadido a tu biblioteca.", "Added to your library.", "Engadido á túa biblioteca."));
  };

  const renderShelf = (shelf: (typeof SHELVES)[number]) => {
    const list = visible.filter((b) => b.shelf === shelf.key);
    if (list.length === 0) {
      return (
        <div key={shelf.key} className={`shelf-empty-row shelf-${shelf.variant}`}>
          <span className="shelf-empty-title">{shelf.label(language)}</span>
          <span className="shelf-empty-hint">{shelf.empty(language)}</span>
        </div>
      );
    }
    return (
      <section key={shelf.key} className={`page-section shelf-section shelf-${shelf.variant}`}>
        <div className="shelf-head">
          <h3 className="shelf-title">{shelf.label(language)}</h3>
          <span className="shelf-count">{list.length}</span>
        </div>
        <div className="book-grid">
          {list.map((b) => (
            <PersonalBookCard key={b.id} book={b} onOpen={(id) => navigate(`/me/book/${id}`)} />
          ))}
        </div>
      </section>
    );
  };

  return (
    <main>
      <div className="home-main home-books">
        <div className="books-hero">
          <div className="books-hero-masthead">
            <h2 className="books-hero-title"><Icon name="book" /> {pick(language, "Tu biblioteca", "Your library", "A túa biblioteca")}</h2>
          </div>
          <div className="books-hero-actions">
            <label className="books-hero-search" aria-label={pick(language, "Buscar libro", "Search book", "Buscar libro")}>
              <Icon name="search" size={13} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={pick(language, "Buscar en tu biblioteca...", "Search your library...", "Buscar na túa biblioteca...")}
              />
            </label>
            <button type="button" className="btn btn-primary books-hero-add" onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={14} /> {pick(language, "Añadir libro", "Add book", "Engadir libro")}
            </button>
          </div>
        </div>

        {loading && books.length === 0 ? (
          <BookGridSkeleton />
        ) : books.length === 0 ? (
          <article className="page-section empty-state">
            <h3>{pick(language, "Tu biblioteca está vacía", "Your library is empty", "A túa biblioteca está baleira")}</h3>
            <p>{pick(language, "Guarda lo que quieres leer, sigue tus capítulos y, si quieres, propón cualquiera al club.", "Save what you want to read, track your chapters, and propose any to your club if you like.", "Garda o que queres ler, segue os teus capítulos e propón calquera ao club se queres.")}</p>
            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
              <Icon name="plus" /> {pick(language, "Añadir un libro", "Add a book", "Engadir un libro")}
            </button>
          </article>
        ) : visible.length === 0 ? (
          <p className="hint">{pick(language, "Ningún libro coincide con la búsqueda.", "No book matches your search.", "Ningún libro coincide coa busca.")}</p>
        ) : (
          <>{SHELVES.map(renderShelf)}</>
        )}
      </div>

      {/* Portal a <body>: PageTransition envuelve esta página en un contenedor
          con transform, que convertiría el overlay fixed del modal en algo
          relativo a ese contenedor (queda cortado por el dock). */}
      {createPortal(
        <AddBookModal open={modalOpen} onClose={() => setModalOpen(false)} onAddBook={handleAddBook} onToast={onToast} context="personal" />,
        document.body
      )}
    </main>
  );
};
