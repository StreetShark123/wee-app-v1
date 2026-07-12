import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AddBookModal } from "../components/AddBookModal";
import { Icon } from "../components/Icon";
import { PersonalBookCard } from "../components/PersonalBookCard";
import { pick, useI18n } from "../lib/i18n";
import type { BookDraft } from "../lib/bookSearch";
import {
  addToPersonalLibrary,
  listPersonalLibrary,
  type PersonalBook,
  type PersonalShelf
} from "../lib/communityApi";
// "Tú": tu biblioteca personal — independiente de cualquier club. Como la del
// club: los libros se tocan y abren su detalle (seguimiento de capítulos, sin
// nada social). Quién eres (perfil, avatar) vive en Ajustes.
interface MePageProps {
  onToast: (message: string) => void;
}

const SHELVES: { key: PersonalShelf; label: (l: "es" | "en" | "gl") => string }[] = [
  { key: "reading", label: (l) => pick(l, "Leyendo ahora", "Reading now", "Lendo agora") },
  { key: "want", label: (l) => pick(l, "Quiero leer", "Want to read", "Quero ler") },
  { key: "read", label: (l) => pick(l, "Leídos", "Read", "Lidos") }
];

export const MePage = ({ onToast }: MePageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [books, setBooks] = useState<PersonalBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

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

  return (
    <main>
      <div className="me-page">
        {/* Biblioteca personal: independiente de cualquier club. */}
        <div className="section-head">
          <h2><Icon name="book" /> {pick(language, "Tu biblioteca", "Your library", "A túa biblioteca")}</h2>
          <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <Icon name="plus" size={14} /> {pick(language, "Añadir libro", "Add book", "Engadir libro")}
          </button>
        </div>
        <p className="hint">{pick(language, "Tus lecturas a título individual, aparte del club. Toca un libro para seguir sus capítulos o proponerlo al club.", "Your reading, aside from the club. Tap a book to track chapters or propose it to your club.", "As túas lecturas a título individual. Toca un libro para seguir os seus capítulos ou propoñelo ao club.")}</p>

        {loading ? (
          <p className="hint">{pick(language, "Cargando…", "Loading…", "Cargando…")}</p>
        ) : books.length === 0 ? (
          <article className="page-section empty-state">
            <p>{pick(language, "Aún no has añadido ningún libro.", "You haven't added any books yet.", "Aínda non engadiches ningún libro.")}</p>
          </article>
        ) : (
          SHELVES.map((s) => {
            const list = books.filter((b) => b.shelf === s.key);
            if (list.length === 0) return null;
            return (
              <div key={s.key} className="personal-shelf">
                <h4 className="personal-shelf-title">{s.label(language)}</h4>
                <div className="personal-book-list">
                  {list.map((b) => (
                    <PersonalBookCard key={b.id} book={b} onOpen={(id) => navigate(`/me/book/${id}`)} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Portal a <body>: PageTransition envuelve esta página en un contenedor
          con transform, que convertiría el overlay fixed del modal en algo
          relativo a ese contenedor (queda cortado por el dock). Mismo patrón
          que el modal de onboarding de HomePage. */}
      {createPortal(
        <AddBookModal open={modalOpen} onClose={() => setModalOpen(false)} onAddBook={handleAddBook} onToast={onToast} context="personal" />,
        document.body
      )}
    </main>
  );
};
