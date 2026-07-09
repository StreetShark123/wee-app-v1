import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AddBookModal } from "../components/AddBookModal";
import { AppFooter } from "../components/AppFooter";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { PersonalBookCard } from "../components/PersonalBookCard";
import { pick, useI18n } from "../lib/i18n";
import { useConfirm } from "../lib/confirm";
import { AVATAR_MAX_PX, imageFileToDataUrl } from "../lib/imageCompress";
import { getSelectedCommunity } from "../lib/communitySession";
import type { BookDraft } from "../lib/bookSearch";
import {
  addToPersonalLibrary,
  listPersonalLibrary,
  proposeToClubFromLibrary,
  removeFromPersonalLibrary,
  setPersonalShelf,
  type PersonalBook,
  type PersonalShelf
} from "../lib/communityApi";
import type { User } from "../lib/types";

// "Tú": quién eres (perfil) — independiente del club. La biblioteca personal
// (quiero leer / leyendo / leídos, a título individual) vive aquí también.
// Los ajustes de la app (notificaciones, accesibilidad, datos, club, sesión)
// se mudaron a /settings (la ruedita del masthead).
interface MePageProps {
  activeUser: User;
  onUpdateAvatar: (userId: string, avatarDataUrl: string | undefined) => Promise<void>;
  onUpdateAlias: (userId: string, alias: string) => Promise<void>;
  onToast: (message: string) => void;
}

const SHELVES: { key: PersonalShelf; label: (l: "es" | "en" | "gl") => string; empty: (l: "es" | "en" | "gl") => string }[] = [
  { key: "reading", label: (l) => pick(l, "Leyendo ahora", "Reading now", "Lendo agora"), empty: (l) => pick(l, "Nada en marcha ahora mismo.", "Nothing in progress right now.", "Nada en marcha agora mesmo.") },
  { key: "want", label: (l) => pick(l, "Quiero leer", "Want to read", "Quero ler"), empty: (l) => pick(l, "Guarda aquí libros que te llamen la atención.", "Save books that catch your eye here.", "Garda aquí libros que che chamen a atención.") },
  { key: "read", label: (l) => pick(l, "Leídos", "Read", "Lidos"), empty: (l) => pick(l, "Los libros que termines quedan aquí.", "Books you finish land here.", "Os libros que remates quedan aquí.") }
];

export const MePage = ({ activeUser, onUpdateAvatar, onUpdateAlias, onToast }: MePageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [alias, setAlias] = useState(activeUser.alias);
  const [savingAlias, setSavingAlias] = useState(false);
  const [books, setBooks] = useState<PersonalBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const communityName = getSelectedCommunity()?.name;

  const load = () => {
    void listPersonalLibrary()
      .then((r) => setBooks(r.books))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const saveAlias = async (): Promise<void> => {
    const clean = alias.trim();
    if (!clean || clean === activeUser.alias || savingAlias) return;
    setSavingAlias(true);
    try {
      await onUpdateAlias(activeUser.id, clean);
      onToast(pick(language, "Alias actualizado.", "Alias updated.", "Alias actualizado."));
    } finally {
      setSavingAlias(false);
    }
  };

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

  const handleSetShelf = async (bookId: string, shelf: PersonalShelf): Promise<void> => {
    setBusyId(bookId);
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, shelf } : b)));
    try {
      await setPersonalShelf(bookId, shelf);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (bookId: string): Promise<void> => {
    const ok = await confirm({
      title: pick(language, "¿Quitar de tu biblioteca?", "Remove from your library?", "Quitar da túa biblioteca?"),
      confirmLabel: pick(language, "Quitar", "Remove", "Quitar"),
      danger: true
    });
    if (!ok) return;
    setBusyId(bookId);
    const prev = books;
    setBooks((cur) => cur.filter((b) => b.id !== bookId));
    try {
      await removeFromPersonalLibrary(bookId);
    } catch {
      setBooks(prev);
    } finally {
      setBusyId(null);
    }
  };

  const handlePropose = async (bookId: string): Promise<void> => {
    if (!communityName) {
      onToast(pick(language, "Entra en un club para proponer un libro.", "Join a club to propose a book.", "Entra nun club para propoñer un libro."));
      return;
    }
    const book = books.find((b) => b.id === bookId);
    const ok = await confirm({
      title: pick(language, `¿Proponer «${book?.title ?? ""}» a ${communityName}?`, `Propose "${book?.title ?? ""}" to ${communityName}?`, `Propoñer «${book?.title ?? ""}» a ${communityName}?`),
      message: book?.shelf === "read"
        ? pick(language, "Ya lo tienes como leído: el club lo verá marcado como «leído por ti» desde el principio.", "You already marked it read: the club will see it tagged \"read by you\" from the start.", "Xa o tes como lido: o club veráo marcado como «lido por ti» dende o principio.")
        : undefined,
      confirmLabel: pick(language, "Proponer", "Propose", "Propoñer")
    });
    if (!ok) return;
    setBusyId(bookId);
    try {
      const { book: created } = await proposeToClubFromLibrary(bookId);
      onToast(pick(language, "Propuesto al club.", "Proposed to the club.", "Proposto ao club."));
      navigate(`/book/${created.id}`);
    } catch (err) {
      onToast((err as Error).message?.includes("BOOK_ALREADY_IN_CLUB")
        ? pick(language, "Ese libro ya está en el club.", "That book is already in the club.", "Ese libro xa está no club.")
        : pick(language, "No se pudo proponer.", "Couldn't propose it.", "Non se puido propoñer."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main>
      <div className="me-page">
        {/* Perfil */}
        <section className="page-section me-hero">
          <div className="me-hero-head">
            <Avatar user={activeUser} size={64} />
            <div className="me-hero-id">
              <strong className="me-hero-alias">{activeUser.alias}</strong>
              <span className="hint">{activeUser.role === "admin"
                ? pick(language, "Administras el club", "You run the club", "Administras o club")
                : pick(language, "Miembro del club", "Club member", "Membro do club")}</span>
            </div>
          </div>
          <div className="me-hero-actions">
            <label className="btn">
              <Icon name="camera" size={14} /> {pick(language, "Cambiar foto", "Change photo", "Cambiar foto")}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void imageFileToDataUrl(file, AVATAR_MAX_PX).then((dataUrl) => {
                    void onUpdateAvatar(activeUser.id, dataUrl);
                    onToast(pick(language, "Foto de perfil actualizada.", "Profile photo updated.", "Foto de perfil actualizada."));
                  });
                }}
              />
            </label>
            {activeUser.avatarDataUrl ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void onUpdateAvatar(activeUser.id, undefined);
                  onToast(pick(language, "Foto eliminada.", "Photo removed.", "Foto eliminada."));
                }}
              >
                <Icon name="trash" size={14} /> {pick(language, "Quitar foto", "Remove photo", "Quitar foto")}
              </button>
            ) : null}
          </div>
          <label className="me-alias-row">
            {pick(language, "Alias", "Alias", "Alias")}
            <span className="me-alias-controls">
              <input value={alias} onChange={(event) => setAlias(event.target.value)} maxLength={40} />
              <button type="button" className="btn btn-primary" disabled={savingAlias || !alias.trim() || alias.trim() === activeUser.alias} onClick={() => void saveAlias()}>
                {pick(language, "Guardar", "Save", "Gardar")}
              </button>
            </span>
          </label>
          <Link to={`/profile/${activeUser.id}`} className="me-link-row">
            <Icon name="eye" size={14} /> {pick(language, "Ver mi perfil público (mis lecturas)", "See my public profile (my reads)", "Ver o meu perfil público")}
          </Link>
        </section>

        {/* Biblioteca personal: independiente de cualquier club. */}
        <section className="page-section personal-library">
          <div className="section-head">
            <h3><Icon name="book" /> {pick(language, "Tu biblioteca", "Your library", "A túa biblioteca")}</h3>
            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={14} /> {pick(language, "Añadir libro", "Add book", "Engadir libro")}
            </button>
          </div>
          <p className="hint">{pick(language, "Tus lecturas a título individual, aparte del club. Puedes proponer al club cualquiera de estos libros.", "Your reading, aside from the club. You can propose any of these books to your club.", "As túas lecturas a título individual, á parte do club. Podes propoñer calquera destes libros ao club.")}</p>

          {loading ? (
            <p className="hint">{pick(language, "Cargando…", "Loading…", "Cargando…")}</p>
          ) : books.length === 0 ? (
            <article className="empty-state">
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
                      <PersonalBookCard
                        key={b.id}
                        book={b}
                        busy={busyId === b.id}
                        onSetShelf={(id, shelf) => void handleSetShelf(id, shelf)}
                        onPropose={(id) => void handlePropose(id)}
                        onRemove={(id) => void handleRemove(id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <AppFooter />
      </div>

      <AddBookModal open={modalOpen} onClose={() => setModalOpen(false)} onAddBook={handleAddBook} onToast={onToast} />
    </main>
  );
};
