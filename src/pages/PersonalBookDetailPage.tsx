import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BookCoverFace } from "../components/BookCoverFace";
import { Icon } from "../components/Icon";
import { PunctuationLoader } from "../components/PunctuationLoader";
import { pick, useI18n } from "../lib/i18n";
import { useConfirm } from "../lib/confirm";
import { getSelectedCommunity } from "../lib/communitySession";
import { parseChapterList } from "../lib/parseChapters";
import {
  listPersonalLibrary,
  personalNote,
  proposeToClubFromLibrary,
  removeFromPersonalLibrary,
  setPersonalChapters,
  setPersonalShelf,
  togglePersonalChapter,
  updatePersonalBook,
  type PersonalBook,
  type PersonalShelf
} from "../lib/communityApi";

interface PersonalBookDetailPageProps {
  onToast: (message: string) => void;
}

const SHELVES: { key: PersonalShelf; label: (l: "es" | "en" | "gl") => string }[] = [
  { key: "want", label: (l) => pick(l, "Quiero leer", "Want to read", "Quero ler") },
  { key: "reading", label: (l) => pick(l, "Leyendo", "Reading", "Lendo") },
  { key: "read", label: (l) => pick(l, "Leído", "Read", "Lido") }
];

// Detalle de un libro de la biblioteca PERSONAL: seguimiento de capítulos a
// título individual, SIN nada social (ni comentarios, ni valoración, ni cita,
// ni media del club). El aviso de refresco mantiene la lista de "Tú" al día.
export const PersonalBookDetailPage = ({ onToast }: PersonalBookDetailPageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { bookId } = useParams<{ bookId: string }>();
  const [book, setBook] = useState<PersonalBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingChapters, setEditingChapters] = useState(false);
  const [chaptersText, setChaptersText] = useState("");
  const [numbered, setNumbered] = useState(10);
  // Header con flip (mismo componente que el club): portada delante, datos +
  // "editar libro" detrás.
  const [heroFlipped, setHeroFlipped] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ title: "", author: "", description: "", coverUrl: "" });
  // Anotaciones por capítulo (simplificado, sin nada social).
  const [openNotesCh, setOpenNotesCh] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void listPersonalLibrary()
      .then((r) => {
        if (!active) return;
        setBook(r.books.find((b) => b.id === bookId) ?? null);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId]);

  const refreshList = () => window.dispatchEvent(new Event("wee:personal-refresh"));
  const apply = (updated: PersonalBook) => { setBook(updated); refreshList(); };

  const changeShelf = async (shelf: PersonalShelf): Promise<void> => {
    if (!book || busy) return;
    setBusy(true);
    try {
      const { book: updated } = await setPersonalShelf(book.id, shelf);
      apply(updated);
    } finally {
      setBusy(false);
    }
  };

  const saveChapters = async (titles: string[]): Promise<void> => {
    if (!book || busy || titles.length === 0) return;
    setBusy(true);
    try {
      const { book: updated } = await setPersonalChapters(book.id, titles);
      apply(updated);
      setEditingChapters(false);
      setChaptersText("");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (): void => {
    if (!book) return;
    setEdit({ title: book.title, author: book.author ?? "", description: book.description ?? "", coverUrl: book.coverUrl ?? "" });
    setHeroFlipped(false);
    setEditOpen(true);
    window.setTimeout(() => document.getElementById("personal-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const saveDetails = async (): Promise<void> => {
    if (!book || busy || !edit.title.trim()) return;
    setBusy(true);
    try {
      const { book: updated } = await updatePersonalBook(book.id, {
        title: edit.title.trim(),
        author: edit.author.trim() || null,
        description: edit.description.trim() || null,
        coverUrl: edit.coverUrl.trim() || null
      });
      apply(updated);
      setEditOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const runNote = async (chapterId: string, action: "add" | "edit" | "delete", opts: { text?: string; noteId?: string }): Promise<void> => {
    if (!book || busy) return;
    setBusy(true);
    try {
      const { book: updated } = await personalNote(book.id, chapterId, action, opts);
      apply(updated);
      if (action === "add") setNoteDraft("");
      if (action === "edit") setEditingNote(null);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (chapterId: string): Promise<void> => {
    if (!book || busy) return;
    setBusy(true);
    try {
      const { book: updated } = await togglePersonalChapter(book.id, chapterId);
      apply(updated);
    } finally {
      setBusy(false);
    }
  };

  const propose = async (): Promise<void> => {
    if (!book || busy) return;
    if (!getSelectedCommunity()) {
      onToast(pick(language, "Entra en un club para proponer un libro.", "Join a club to propose a book.", "Entra nun club para propoñer un libro."));
      return;
    }
    const ok = await confirm({
      title: pick(language, `¿Proponer «${book.title}» a tu club?`, `Propose "${book.title}" to your club?`, `Propoñer «${book.title}» ao teu club?`),
      confirmLabel: pick(language, "Proponer", "Propose", "Propoñer")
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { book: created } = await proposeToClubFromLibrary(book.id);
      onToast(pick(language, "Propuesto al club.", "Proposed to the club.", "Proposto ao club."));
      navigate(`/book/${created.id}`);
    } catch (err) {
      onToast((err as Error).message?.includes("BOOK_ALREADY_IN_CLUB")
        ? pick(language, "Ese libro ya está en el club.", "That book is already in the club.", "Ese libro xa está no club.")
        : pick(language, "No se pudo proponer.", "Couldn't propose it.", "Non se puido propoñer."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!book || busy) return;
    const ok = await confirm({
      title: pick(language, "¿Quitar de tu biblioteca?", "Remove from your library?", "Quitar da túa biblioteca?"),
      confirmLabel: pick(language, "Quitar", "Remove", "Quitar"),
      danger: true
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeFromPersonalLibrary(book.id);
      refreshList();
      navigate("/me");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PunctuationLoader />;
  if (!book) {
    return (
      <main>
        <section className="page-section narrow">
          <h2>{pick(language, "Libro no disponible", "Book unavailable", "Libro non dispoñible")}</h2>
          <button type="button" className="btn" onClick={() => navigate("/me")}>
            <Icon name="arrowLeft" /> {pick(language, "Volver a tu biblioteca", "Back to your library", "Volver á túa biblioteca")}
          </button>
        </section>
      </main>
    );
  }

  const total = book.chapters.length;
  const doneSet = new Set(book.chaptersDone);
  const doneCount = book.chaptersDone.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const metaLine = [book.publishedYear ? String(book.publishedYear) : null, book.pageCount ? pick(language, `${book.pageCount} págs.`, `${book.pageCount} pp.`, `${book.pageCount} páxs.`) : null].filter(Boolean).join(" · ");

  const chapterEditor = (
    <div className="personal-chapters-editor">
      <label className="form-field">
        {pick(language, "Pega la lista de capítulos (uno por línea)", "Paste the chapter list (one per line)", "Pega a lista de capítulos (un por liña)")}
        <textarea rows={5} value={chaptersText} onChange={(e) => setChaptersText(e.target.value)} placeholder={"1. ...\n2. ...\n3. ..."} />
      </label>
      <div className="personal-chapters-editor-actions">
        <button type="button" className="btn btn-primary" disabled={busy || parseChapterList(chaptersText).length === 0} onClick={() => void saveChapters(parseChapterList(chaptersText))}>
          <Icon name="check" size={14} /> {pick(language, "Guardar capítulos", "Save chapters", "Gardar capítulos")}
        </button>
        <span className="personal-chapters-or">{pick(language, "o", "or", "ou")}</span>
        <label className="personal-chapters-numbered">
          <input type="number" min={1} max={400} value={numbered} onChange={(e) => setNumbered(Math.max(1, Math.min(400, Number(e.target.value) || 1)))} />
          <button type="button" className="btn" disabled={busy} onClick={() => void saveChapters(Array.from({ length: numbered }, (_, i) => pick(language, `Capítulo ${i + 1}`, `Chapter ${i + 1}`, `Capítulo ${i + 1}`)))}>
            {pick(language, "capítulos numerados", "numbered chapters", "capítulos numerados")}
          </button>
        </label>
      </div>
      {total > 0 ? (
        <button type="button" className="btn btn-tiny" onClick={() => { setEditingChapters(false); setChaptersText(""); }}>
          {pick(language, "Cancelar", "Cancel", "Cancelar")}
        </button>
      ) : null}
    </div>
  );

  return (
    <main>
      <div className="book-detail">
        <div className="book-action-bar">
          <button type="button" className="book-back" onClick={() => navigate("/me")}>
            <Icon name="arrowLeft" size={14} /> {pick(language, "Tu biblioteca", "Your library", "A túa biblioteca")}
          </button>
          <span className="book-shelf-chip personal-shelf-chip">{SHELVES.find((s) => s.key === book.shelf)?.label(language)}</span>
        </div>

        {/* Cabecera = MISMO flip que el club (ajustado): portada delante,
            datos + "editar libro" detrás. Sin nada social. */}
        <section className="page-section personal-hero-wrap">
          <div className={`book-hero-flip${heroFlipped ? " is-flipped" : ""}`}>
            <div className="book-hero-flip-inner">
              <div className="book-hero-face book-hero-face-front">
                <BookCoverFace coverUrl={book.coverUrl} title={book.title} author={book.author} progressPct={total > 0 ? pct : null} readers={[]} />
                <button type="button" className="book-hero-flip-btn" onClick={() => setHeroFlipped(true)} aria-label={pick(language, "Más información", "More information", "Máis información")} title={pick(language, "Más información", "More information", "Máis información")}>
                  <Icon name="info" size={16} />
                </button>
              </div>
              <div className="book-hero-face book-hero-face-back">
                <button type="button" className="book-hero-flip-btn" onClick={() => setHeroFlipped(false)} aria-label={pick(language, "Volver a la portada", "Back to the cover", "Volver á portada")} title={pick(language, "Volver", "Back", "Volver")}>
                  <Icon name="arrowLeft" size={16} />
                </button>
                <div className="book-hero-back-scroll">
                  <h1>{book.title}</h1>
                  <p className="book-detail-author">{book.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}</p>
                  {metaLine ? <p className="book-detail-metaline">{metaLine}</p> : null}
                  {book.description ? <p className="book-hero-synopsis">{book.description}</p> : null}
                  {!editOpen ? (
                    <button type="button" className="btn btn-tiny book-hero-edit" onClick={openEdit}>
                      <Icon name="pencil" size={12} /> {pick(language, "Editar libro", "Edit book", "Editar libro")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Editar datos del libro personal (título/autor/portada/sinopsis). */}
        {editOpen ? (
          <section id="personal-edit-form" className="page-section">
            <div className="section-head"><h2><Icon name="pencil" /> {pick(language, "Editar libro", "Edit book", "Editar libro")}</h2></div>
            <label className="form-field">{pick(language, "Título", "Title", "Título")}
              <input value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} maxLength={300} />
            </label>
            <label className="form-field">{pick(language, "Autor", "Author", "Autor")}
              <input value={edit.author} onChange={(e) => setEdit((p) => ({ ...p, author: e.target.value }))} maxLength={200} />
            </label>
            <label className="form-field">{pick(language, "Portada (URL)", "Cover (URL)", "Portada (URL)")}
              <input value={edit.coverUrl} onChange={(e) => setEdit((p) => ({ ...p, coverUrl: e.target.value }))} placeholder="https://…" />
            </label>
            <label className="form-field">{pick(language, "Sinopsis", "Description", "Sinopse")}
              <textarea rows={4} value={edit.description} onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))} maxLength={4000} />
            </label>
            <div className="personal-detail-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => setEditOpen(false)}>{pick(language, "Cancelar", "Cancel", "Cancelar")}</button>
              <button type="button" className="btn btn-primary" disabled={busy || !edit.title.trim()} onClick={() => void saveDetails()}>
                <Icon name="check" size={14} /> {pick(language, "Guardar", "Save", "Gardar")}
              </button>
            </div>
            {/* Quitar de la biblioteca vive dentro de editar (acción del libro). */}
            <div className="personal-edit-danger">
              <button type="button" className="btn me-logout" disabled={busy} onClick={() => void remove()}>
                <Icon name="trash" size={14} /> {pick(language, "Quitar de mi biblioteca", "Remove from my library", "Quitar da miña biblioteca")}
              </button>
            </div>
          </section>
        ) : null}

        {/* Estantería personal. */}
        <section className="page-section">
          <div className="section-head section-head-sub"><h3>{pick(language, "Tu estado", "Your status", "O teu estado")}</h3></div>
          <div className="personal-shelf-pills">
            {SHELVES.map((s) => (
              <button key={s.key} type="button" className={`btn${book.shelf === s.key ? " btn-primary" : ""}`} disabled={busy} onClick={() => void changeShelf(s.key)}>
                {s.key === "read" ? <Icon name="check" size={13} /> : null} {s.label(language)}
              </button>
            ))}
          </div>
        </section>

        {/* Seguimiento de capítulos. */}
        <section className="page-section">
          <div className="section-head section-head-sub">
            <h3><Icon name="timeline" /> {pick(language, "Capítulos", "Chapters", "Capítulos")}</h3>
            {total > 0 && !editingChapters ? (
              <button type="button" className="btn btn-tiny" onClick={() => setEditingChapters(true)}>{pick(language, "Editar", "Edit", "Editar")}</button>
            ) : null}
          </div>

          {total === 0 || editingChapters ? (
            chapterEditor
          ) : (
            <>
              <div className="personal-chapters-progress">
                <span className="personal-book-progress-bar"><span className="personal-book-progress-fill" style={{ width: `${pct}%` }} /></span>
                <span className="hint">{pick(language, `${doneCount}/${total} leídos`, `${doneCount}/${total} read`, `${doneCount}/${total} lidos`)}</span>
              </div>
              <ul className="personal-chapter-list">
                {book.chapters.map((ch, i) => {
                  const isDone = doneSet.has(ch.id);
                  const chNotes = book.notes[ch.id] ?? [];
                  const open = openNotesCh === ch.id;
                  return (
                    <li key={ch.id}>
                      <div className="personal-chapter-row-wrap">
                        <button type="button" className={`personal-chapter-row${isDone ? " is-done" : ""}`} disabled={busy} onClick={() => void toggle(ch.id)}>
                          <span className="personal-chapter-check" aria-hidden="true">{isDone ? <Icon name="check" size={13} /> : null}</span>
                          <span className="personal-chapter-title">{/^\s*\d+[.)\s]/.test(ch.title) ? ch.title : `${i + 1}. ${ch.title}`}</span>
                        </button>
                        <button
                          type="button"
                          className={`personal-chapter-notes-btn${chNotes.length > 0 ? " has-notes" : ""}${open ? " is-open" : ""}`}
                          onClick={() => { setOpenNotesCh(open ? null : ch.id); setEditingNote(null); setNoteDraft(""); }}
                          aria-label={pick(language, "Anotaciones", "Notes", "Anotacións")}
                          title={pick(language, "Anotaciones", "Notes", "Anotacións")}
                        >
                          <Icon name="pencil" size={13} />{chNotes.length > 0 ? <span className="personal-chapter-notes-count">{chNotes.length}</span> : null}
                        </button>
                      </div>

                      {open ? (
                        <div className="personal-notes">
                          {chNotes.map((n) => (
                            <div key={n.id} className="personal-note">
                              {editingNote?.id === n.id ? (
                                <div className="personal-note-edit">
                                  <textarea rows={2} value={editingNote.text} onChange={(e) => setEditingNote({ id: n.id, text: e.target.value })} />
                                  <div className="personal-note-edit-actions">
                                    <button type="button" className="btn btn-tiny" disabled={busy} onClick={() => setEditingNote(null)}>{pick(language, "Cancelar", "Cancel", "Cancelar")}</button>
                                    <button type="button" className="btn btn-tiny btn-primary" disabled={busy || !editingNote.text.trim()} onClick={() => void runNote(ch.id, "edit", { noteId: n.id, text: editingNote.text.trim() })}>{pick(language, "Guardar", "Save", "Gardar")}</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="personal-note-text">{n.text}</p>
                                  <div className="personal-note-actions">
                                    <button type="button" className="link-btn" disabled={busy} onClick={() => setEditingNote({ id: n.id, text: n.text })} aria-label={pick(language, "Editar", "Edit", "Editar")}><Icon name="pencil" size={12} /></button>
                                    <button type="button" className="link-btn personal-note-del" disabled={busy} onClick={() => void runNote(ch.id, "delete", { noteId: n.id })} aria-label={pick(language, "Borrar", "Delete", "Borrar")}><Icon name="trash" size={12} /></button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                          <div className="personal-note-add">
                            <textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder={pick(language, "Tu anotación de este capítulo…", "Your note for this chapter…", "A túa anotación deste capítulo…")} />
                            <button type="button" className="btn btn-tiny btn-primary personal-note-add-btn" disabled={busy || !noteDraft.trim()} onClick={() => void runNote(ch.id, "add", { text: noteDraft.trim() })}>
                              <Icon name="plus" size={12} /> {pick(language, "Añadir", "Add", "Engadir")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* Acción de puente con el club (no social): proponer al club. Quitar de
            la biblioteca se movió al menú de editar. */}
        <section className="page-section">
          <div className="personal-detail-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void propose()}>
              <Icon name="users" size={14} /> {pick(language, "Proponer al club", "Propose to club", "Propoñer ao club")}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
};
