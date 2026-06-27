import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChapterTimeline } from "../components/ChapterTimeline";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { pick, useI18n } from "../lib/i18n";
import { parseChapterList } from "../lib/parseChapters";
import { getCachedBook, setCachedBook } from "../lib/booksCache";
import { BookDetailSkeleton } from "../components/Skeletons";
import { CommentThread } from "../components/CommentThread";
import { MentionTextarea } from "../components/MentionTextarea";
import {
  addBookComment,
  addChapterNote,
  completeAllChapters,
  reactComment,
  updateComment,
  deleteComment,
  finishBook,
  getClubBook,
  setBookChaptersList,
  setBookFeatured,
  setBookStatus,
  setBookTarget,
  toggleChapter,
  updateBook,
  voteBook,
  type BookDetail,
  type BookMemberProgress,
  type BookStatus,
  type BookVote,
  type CommentReaction,
  type MemberBook,
  type NoteKind
} from "../lib/communityApi";
import type { User } from "../lib/types";

interface BookDetailPageProps {
  activeUser: User;
  onOpenAddBook: () => void;
  onLogout: () => void;
  onBooksChanged: () => void;
}

const statusLabel = (status: string, language: "es" | "en" | "gl"): string => {
  if (status === "reading") return pick(language, "En lectura", "Reading", "En lectura");
  if (status === "finished") return pick(language, "Leído por el club", "Read by the club", "Lido polo club");
  return pick(language, "Propuesto", "Proposed", "Proposto");
};

// Toggle local optimista de una reacción: clic en la tuya la quita; clic en otra suma +1.
const toggleReactionLocal = (reactions: CommentReaction[], emoji: string): CommentReaction[] => {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) return [...reactions, { emoji, count: 1, mine: true }];
  if (existing.mine) {
    const count = existing.count - 1;
    return count <= 0 ? reactions.filter((r) => r.emoji !== emoji) : reactions.map((r) => (r.emoji === emoji ? { ...r, count, mine: false } : r));
  }
  return reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, mine: true } : r));
};

export const BookDetailPage = ({ activeUser, onOpenAddBook, onLogout, onBooksChanged }: BookDetailPageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const { bookId } = useParams<{ bookId: string }>();
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chaptersRaw, setChaptersRaw] = useState("");
  const [numberInput, setNumberInput] = useState(0);
  const [ratingInput, setRatingInput] = useState(0);
  const [reviewInput, setReviewInput] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentChapter, setCommentChapter] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ title: "", author: "", coverUrl: "", description: "" });
  const [targetCh, setTargetCh] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const load = useCallback(async () => {
    if (!bookId) return;
    const cached = getCachedBook(bookId);
    if (cached) {
      setDetail(cached);
      setRatingInput(cached.myMember?.rating ?? 0);
      setReviewInput(cached.myMember?.review ?? "");
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await getClubBook(bookId);
      setDetail(data);
      setCachedBook(bookId, data);
      setRatingInput(data.myMember?.rating ?? 0);
      setReviewInput(data.myMember?.review ?? "");
      setError(null);
    } catch (err) {
      if (!cached) setError(err instanceof Error ? err.message : pick(language, "No se pudo cargar el libro.", "Couldn't load the book.", "Non se puido cargar o libro."));
    } finally {
      setLoading(false);
    }
  }, [bookId, language]);

  useEffect(() => {
    void load();
  }, [load]);

  // Actualiza SOLO lo que cambia en la ficha (nunca recarga toda la página).
  const patch = (fn: (d: BookDetail) => BookDetail) => setDetail((prev) => (prev ? fn(prev) : prev));

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onBooksChanged(); // refresca la estantería de fondo (no la ficha)
    } catch {
      void load(); // si algo falla, recupera el estado real
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detail) {
    return (
      <main>
        <TopBar user={activeUser} onOpenShare={onOpenAddBook} onLogout={onLogout} />
        <BookDetailSkeleton />
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main>
        <TopBar user={activeUser} onOpenShare={onOpenAddBook} onLogout={onLogout} />
        <section className="page-section narrow">
          <h2>{pick(language, "Libro no disponible", "Book unavailable", "Libro non dispoñible")}</h2>
          <p className="warning">{error}</p>
          <button type="button" className="btn" onClick={() => navigate("/home")}>
            <Icon name="arrowLeft" /> {pick(language, "Volver a la estantería", "Back to the shelf", "Volver á estantería")}
          </button>
        </section>
      </main>
    );
  }

  const { book, comments, members, myMember, chapters, votes, activeMemberCount, clubMembers } = detail;
  const named = chapters.length > 0;
  const total = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.doneByMe).length;
  const allDone = total > 0 && doneCount === total;
  const mergeMyMember = (d: BookDetail, m: MemberBook): BookMemberProgress => ({ ...m, alias: d.myMember?.alias ?? activeUser.alias });

  const handleVote = (vote: BookVote) =>
    run(async () => {
      const r = await voteBook(book.id, vote);
      patch((d) => ({ ...d, votes: r.votes, book: { ...d.book, status: r.bookStatus } }));
    });
  const handleStatus = (status: BookStatus) =>
    run(async () => {
      const r = await setBookStatus(book.id, status);
      patch((d) => ({ ...d, book: r.book }));
    });
  const handleCompleteAll = (done: boolean) =>
    run(async () => {
      const r = await completeAllChapters(book.id, done);
      patch((d) => ({
        ...d,
        chapters: d.chapters.map((c) => ({
          ...c,
          doneByMe: done,
          completedCount: c.doneByMe === done ? c.completedCount : Math.max(0, c.completedCount + (done ? 1 : -1))
        })),
        myMember: mergeMyMember(d, r.myMember),
        book: { ...d.book, status: r.bookStatus }
      }));
    });
  const saveRating = (value: number) => {
    setRatingInput(value);
    void run(async () => {
      const r = await finishBook(book.id, value, reviewInput.trim() || undefined);
      patch((d) => ({ ...d, myMember: mergeMyMember(d, r.myMember), book: { ...d.book, status: r.bookStatus } }));
    });
  };
  const canSetChapters = book.addedBy === activeUser.id || activeUser.role === "admin";
  const isAdmin = activeUser.role === "admin";
  const handleFeature = (featured: "gold" | "silver" | null) =>
    run(async () => {
      const r = await setBookFeatured(book.id, featured);
      patch((d) => ({ ...d, book: r.book }));
    });
  const openEdit = () => {
    setEdit({ title: book.title, author: book.author ?? "", coverUrl: book.coverUrl ?? "", description: book.description ?? "" });
    setTargetCh(book.targetChapter ? String(book.targetChapter) : "");
    setTargetDate(book.targetDate ?? "");
    setEditOpen(true);
  };
  const handleSetTarget = () =>
    run(async () => {
      const r = await setBookTarget(book.id, {
        targetChapter: targetCh ? Number(targetCh) : null,
        targetDate: targetDate || null
      });
      patch((d) => ({ ...d, book: r.book }));
    });
  const facilitatorAlias = clubMembers.find((m) => m.id === book.addedBy)?.alias ?? null;
  const handleSaveEdit = () => {
    void run(async () => {
      const r = await updateBook(book.id, {
        title: edit.title.trim() || book.title,
        author: edit.author.trim() || null,
        coverUrl: edit.coverUrl.trim() || null,
        description: edit.description.trim() || null
      });
      patch((d) => ({ ...d, book: r.book }));
      setEditOpen(false);
    });
  };
  const progressPct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;
  const parsedPreview = parseChapterList(chaptersRaw);
  const daysLeft = book.targetDate ? Math.ceil((new Date(`${book.targetDate}T23:59:59`).getTime() - Date.now()) / 86400000) : null;
  const hasCadence = book.status === "reading" && (book.targetChapter || book.targetDate);
  const readChapterIds = new Set(chapters.filter((c) => c.doneByMe).map((c) => c.id));
  const chapterLabelById = new Map(chapters.map((c, i) => [c.id, `${i + 1}`]));

  // Marcar capítulo: optimista e instantáneo (no bloquea ni recarga).
  const handleToggle = (chapterId: string, done: boolean) => {
    patch((d) => ({
      ...d,
      chapters: d.chapters.map((c) =>
        c.id === chapterId ? { ...c, doneByMe: done, completedCount: Math.max(0, c.completedCount + (done ? 1 : -1)) } : c
      )
    }));
    void toggleChapter(chapterId, done)
      .then((r) => {
        patch((d) => ({ ...d, myMember: mergeMyMember(d, r.myMember), book: { ...d.book, status: r.bookStatus } }));
        onBooksChanged();
      })
      .catch(() => void load());
  };
  const handleAddNote = async (chapterId: string, text: string, kind: NoteKind, imageUrl?: string) => {
    const { note } = await addChapterNote(chapterId, text, kind, imageUrl);
    patch((d) => ({ ...d, chapters: d.chapters.map((c) => (c.id === chapterId ? { ...c, notes: [...c.notes, note] } : c)) }));
    onBooksChanged();
  };
  const handleReply = async (parentId: string, text: string) => {
    const { comment } = await addBookComment(book.id, text, { parentId });
    patch((d) => ({ ...d, comments: [...d.comments, comment] }));
    onBooksChanged();
  };
  const handleAddComment = (text: string, chapterId?: string) =>
    run(async () => {
      const { comment } = await addBookComment(book.id, text, chapterId ? { chapterId } : undefined);
      patch((d) => ({ ...d, comments: [...d.comments, comment] }));
    });
  const handleEditComment = async (commentId: string, text: string) => {
    await updateComment(commentId, text);
    patch((d) => ({ ...d, comments: d.comments.map((c) => (c.id === commentId ? { ...c, text } : c)) }));
    onBooksChanged();
  };
  const handleDeleteComment = (commentId: string) => {
    patch((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== commentId && c.parentId !== commentId) }));
    void deleteComment(commentId).then(onBooksChanged).catch(() => void load());
  };
  const handleFinish = () =>
    run(async () => {
      const r = await finishBook(book.id, ratingInput || undefined, reviewInput.trim() || undefined);
      patch((d) => ({ ...d, myMember: mergeMyMember(d, r.myMember), book: { ...d.book, status: r.bookStatus } }));
    });
  // Reacción optimista: actualiza solo ese comentario al instante (sin recargar la ficha).
  const handleReact = (commentId: string, emoji: string) => {
    setDetail((prev) =>
      prev
        ? { ...prev, comments: prev.comments.map((c) => (c.id === commentId ? { ...c, reactions: toggleReactionLocal(c.reactions, emoji) } : c)) }
        : prev
    );
    void reactComment(commentId, emoji)
      .then(({ reactions }) => {
        setDetail((prev) =>
          prev ? { ...prev, comments: prev.comments.map((c) => (c.id === commentId ? { ...c, reactions } : c)) } : prev
        );
      })
      .catch(() => {
        void load(); // si falla, recupera el estado real
      });
  };
  const confirmReset = (): boolean =>
    chapters.length === 0 ||
    window.confirm(
      pick(
        language,
        "Esto reemplaza la lista de capítulos y REINICIA el progreso de todo el club. ¿Seguro?",
        "This replaces the chapter list and RESETS the whole club's progress. Are you sure?",
        "Isto substitúe a lista e REINICIA o progreso de todo o club. Seguro?"
      )
    );
  const applyChapters = (titles: string[]) =>
    run(async () => {
      const r = await setBookChaptersList(book.id, titles);
      patch((d) => ({
        ...d,
        chapters: r.chapters,
        book: { ...d.book, status: r.bookStatus },
        myMember: d.myMember ? { ...d.myMember, chaptersDone: 0, shelf: "want" } : null
      }));
      setChaptersRaw("");
    });
  const handleCreateChapters = () => {
    const titles = parseChapterList(chaptersRaw);
    if (titles.length === 0 || !confirmReset()) return;
    void applyChapters(titles);
  };
  const handleCreateNumbered = (count: number) => {
    if (count < 1 || !confirmReset()) return;
    void applyChapters(
      Array.from({ length: Math.min(400, count) }, (_, i) => pick(language, `Capítulo ${i + 1}`, `Chapter ${i + 1}`, `Capítulo ${i + 1}`))
    );
  };

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenAddBook} onLogout={onLogout} />

      <div className="book-detail">
        <button type="button" className="book-back" onClick={() => navigate("/home")}>
          <Icon name="arrowLeft" size={14} /> {pick(language, "Estantería del club", "Club shelf", "Estantería do club")}
        </button>

        <section className="page-section book-detail-head">
          {book.coverUrl ? (
            <img className="book-cover book-cover-lg" src={book.coverUrl} alt="" />
          ) : (
            <span className="book-cover book-cover-lg book-cover-empty" aria-hidden="true">
              <Icon name="book" />
            </span>
          )}
          <div className="book-detail-meta">
            <span className={`book-card-status book-card-status-${book.status}`}>{statusLabel(book.status, language)}</span>
            <h1>{book.title}</h1>
            <p className="book-detail-author">
              {book.author ?? pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")}
              {book.publishedYear ? ` · ${book.publishedYear}` : ""}
            </p>
            {book.description ? <p className="book-detail-synopsis">{book.description}</p> : null}
            {facilitatorAlias && book.status !== "proposed" ? (
              <p className="book-facilitator"><Icon name="spark" size={12} /> {pick(language, `Facilita: ${facilitatorAlias}`, `Facilitator: ${facilitatorAlias}`, `Facilita: ${facilitatorAlias}`)}</p>
            ) : null}
            {hasCadence ? (
              <p className="book-cadence">
                <Icon name="target" size={12} />{" "}
                {book.targetChapter ? pick(language, `Meta: hasta el cap. ${book.targetChapter}`, `Goal: through ch. ${book.targetChapter}`, `Meta: ata o cap. ${book.targetChapter}`) : pick(language, "Meta esta semana", "This week's goal", "Meta esta semana")}
                {daysLeft != null ? (
                  <span className="book-cadence-days">
                    {" · "}
                    {daysLeft < 0 ? pick(language, "vencida", "overdue", "vencida") : daysLeft === 0 ? pick(language, "hoy", "today", "hoxe") : pick(language, `faltan ${daysLeft} días`, `${daysLeft} days left`, `faltan ${daysLeft} días`)}
                  </span>
                ) : null}
              </p>
            ) : null}
            {book.featured === "gold" ? (
              <span className="book-flag book-flag-gold book-flag-inline">
                {pick(language, "Lectura principal del club", "Club's main read", "Lectura principal do club")}
              </span>
            ) : null}
            {canSetChapters && !editOpen ? (
              <button type="button" className="btn book-edit-toggle" onClick={openEdit}>
                <Icon name="pencil" size={13} /> {isAdmin ? pick(language, "Editar / gestionar", "Edit / manage", "Editar / xestionar") : pick(language, "Editar libro", "Edit book", "Editar libro")}
              </button>
            ) : null}
          </div>
        </section>

        {editOpen ? (
          <section className="page-section book-edit-form">
            <div className="section-head">
              <h2><Icon name="pencil" /> {pick(language, "Editar libro", "Edit book", "Editar libro")}</h2>
            </div>

            {isAdmin ? (
              <div className="book-manage">
                <div className="book-feature-controls">
                  <span className="hint">{pick(language, "Estado del libro:", "Book status:", "Estado do libro:")}</span>
                  {(["proposed", "reading", "finished"] as BookStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`btn book-status-btn${book.status === status ? " is-on" : ""}`}
                      disabled={busy}
                      onClick={() => handleStatus(status)}
                    >
                      {statusLabel(status, language)}
                    </button>
                  ))}
                </div>
                {book.status === "reading" ? (
                  <button type="button" className={`btn book-feature-btn gold${book.featured === "gold" ? " is-on" : ""}`} disabled={busy} onClick={() => handleFeature(book.featured === "gold" ? null : "gold")}>
                    <Icon name="spark" size={13} /> {book.featured === "gold" ? pick(language, "Quitar principal", "Unset main", "Quitar principal") : pick(language, "Marcar como principal", "Set as main", "Marcar como principal")}
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="hint">{pick(language, "Si Google no trae la portada correcta, pega aquí la URL de una imagen.", "If Google's cover is wrong, paste an image URL here.", "Se Google non trae a portada correcta, pega aquí o URL dunha imaxe.")}</p>
            <label className="form-field">
              {pick(language, "Título", "Title", "Título")}
              <input value={edit.title} onChange={(event) => setEdit((prev) => ({ ...prev, title: event.target.value }))} />
            </label>
            <label className="form-field">
              {pick(language, "Autor", "Author", "Autor")}
              <input value={edit.author} onChange={(event) => setEdit((prev) => ({ ...prev, author: event.target.value }))} />
            </label>
            <label className="form-field">
              {pick(language, "URL de la portada", "Cover image URL", "URL da portada")}
              <input type="url" value={edit.coverUrl} onChange={(event) => setEdit((prev) => ({ ...prev, coverUrl: event.target.value }))} placeholder="https://..." />
            </label>
            {edit.coverUrl.trim() ? <img className="book-edit-preview" src={edit.coverUrl} alt="" /> : null}
            <label className="form-field">
              {pick(language, "Sinopsis", "Description", "Sinopse")}
              <textarea rows={3} value={edit.description} onChange={(event) => setEdit((prev) => ({ ...prev, description: event.target.value }))} />
            </label>
            <div className="auth-entry-actions">
              <button type="button" className="btn" onClick={() => setEditOpen(false)} disabled={busy}>
                {pick(language, "Cancelar", "Cancel", "Cancelar")}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveEdit} disabled={busy}>
                <Icon name="check" /> {pick(language, "Guardar cambios", "Save changes", "Gardar cambios")}
              </button>
            </div>

            {/* C1: cadencia (meta de lectura) */}
            <div className="book-manage book-cadence-edit">
              <span className="hint"><Icon name="target" size={13} /> {pick(language, "Cadencia (meta de lectura):", "Cadence (reading goal):", "Cadencia (meta de lectura):")}</span>
              <label className="book-chapter-set">
                {pick(language, "Hasta el capítulo", "Through chapter", "Ata o capítulo")}
                <input type="number" min={0} value={targetCh} onChange={(event) => setTargetCh(event.target.value)} />
              </label>
              <label className="book-chapter-set">
                {pick(language, "Para la fecha", "By date", "Para a data")}
                <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
              </label>
              <button type="button" className="btn" disabled={busy} onClick={handleSetTarget}>
                {pick(language, "Fijar cadencia", "Set cadence", "Fixar cadencia")}
              </button>
            </div>
          </section>
        ) : null}

        {/* Votación de la propuesta */}
        {book.status === "proposed" ? (
          <section className="page-section book-vote">
            <div className="section-head">
              <h2><Icon name="check" /> {pick(language, "¿Lo leemos?", "Shall we read it?", "Lémolo?")}</h2>
            </div>
            {book.proposalNote ? (
              <blockquote className="book-proposal-note">
                {facilitatorAlias ? <span className="book-proposal-by">{facilitatorAlias}: </span> : null}«{book.proposalNote}»
              </blockquote>
            ) : null}
            <p className="hint">{pick(language, "Se aprueba por mayoría de síes, o cuando un admin lo aprueba.", "Approved by majority of yes votes, or when an admin approves it.", "Apróbase por maioría de síes, ou cando un admin o aproba.")}</p>
            {activeMemberCount > 0 ? (
              <div className="vote-quorum">
                <span className="vote-quorum-bar"><span className="vote-quorum-fill" style={{ width: `${Math.min(100, Math.round((votes.yes / activeMemberCount) * 100))}%` }} /></span>
                <span className="vote-quorum-label">{votes.yes}/{activeMemberCount} {pick(language, "a favor para empezar", "in favor to start", "a favor para empezar")}</span>
              </div>
            ) : null}
            <div className="vote-buttons">
              <button type="button" className={`btn vote-btn yes${votes.myVote === "yes" ? " is-on" : ""}`} disabled={busy} onClick={() => handleVote("yes")}>
                {pick(language, "Sí", "Yes", "Si")} · {votes.yes}
              </button>
              <button type="button" className={`btn vote-btn no${votes.myVote === "no" ? " is-on" : ""}`} disabled={busy} onClick={() => handleVote("no")}>
                {pick(language, "No", "No", "Non")} · {votes.no}
              </button>
              <button type="button" className={`btn vote-btn later${votes.myVote === "later" ? " is-on" : ""}`} disabled={busy} onClick={() => handleVote("later")}>
                {pick(language, "Ahora no", "Not now", "Agora non")} · {votes.later}
              </button>
            </div>
            {isAdmin ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleStatus("reading")}>
                <Icon name="check" /> {pick(language, "Aprobar y poner en lectura", "Approve and start reading", "Aprobar e poñer en lectura")}
              </button>
            ) : null}
          </section>
        ) : null}

        {/* Seguimiento de lectura por capítulos */}
        <section className="page-section">
          <div className="section-head">
            <h2><Icon name="timeline" /> {pick(language, "Capítulos", "Chapters", "Capítulos")}</h2>
            {named ? (
              <span className="book-progress-label">{doneCount}/{total}</span>
            ) : null}
          </div>

          {named ? (
            <div className="stack">
              <span className="book-card-progress">
                <span className="book-card-progress-fill" style={{ width: `${progressPct}%` }} />
              </span>
              {allDone ? (
                <>
                  <p className="chapter-alldone"><Icon name="check" /> {pick(language, "Has leído todos los capítulos.", "You've read every chapter.", "Liches todos os capítulos.")}</p>
                  <details className="chapter-collapsed">
                    <summary>{pick(language, `Ver los ${total} capítulos`, `Show the ${total} chapters`, `Ver os ${total} capítulos`)}</summary>
                    <ChapterTimeline chapters={chapters} busy={busy} onToggle={handleToggle} onAddNote={handleAddNote} />
                  </details>
                </>
              ) : (
                <>
                  <ChapterTimeline chapters={chapters} busy={busy} onToggle={handleToggle} onAddNote={handleAddNote} />
                  <button type="button" className="btn chapter-mark-all" disabled={busy} onClick={() => handleCompleteAll(true)}>
                    <Icon name="check" /> {pick(language, "Marcar todo como leído", "Mark all as read", "Marcar todo como lido")}
                  </button>
                </>
              )}
              {canSetChapters ? (
                <details className="chapter-redefine">
                  <summary>{pick(language, "Redefinir la lista de capítulos", "Redefine the chapter list", "Redefinir a lista de capítulos")}</summary>
                  <p className="hint">{pick(language, "Ojo: reemplaza la lista y reinicia el progreso de todos.", "Careful: replaces the list and resets everyone's progress.", "Ollo: substitúe a lista e reinicia o progreso de todos.")}</p>
                  <textarea
                    rows={5}
                    value={chaptersRaw}
                    onChange={(event) => setChaptersRaw(event.target.value)}
                    placeholder={pick(language, "Pega aquí el índice...", "Paste the table of contents here...", "Pega aquí o índice...")}
                  />
                  <button type="button" className="btn btn-danger" disabled={busy || parsedPreview.length === 0} onClick={handleCreateChapters}>
                    {pick(language, `Reemplazar (${parsedPreview.length})`, `Replace (${parsedPreview.length})`, `Substituír (${parsedPreview.length})`)}
                  </button>
                </details>
              ) : null}
            </div>
          ) : canSetChapters ? (
            <div className="stack">
              <p className="hint">
                {pick(
                  language,
                  "Pega el índice del libro: detectamos cada capítulo y los miembros podrán ir marcándolos.",
                  "Paste the book's table of contents: we detect each chapter and members can check them off.",
                  "Pega o índice do libro: detectamos cada capítulo e os membros poderán marcalos."
                )}
              </p>
              <textarea
                rows={6}
                value={chaptersRaw}
                onChange={(event) => setChaptersRaw(event.target.value)}
                placeholder={pick(
                  language,
                  "1. El comienzo\n2. La travesía\n3. ...",
                  "1. The beginning\n2. The journey\n3. ...",
                  "1. O comezo\n2. A travesía\n3. ..."
                )}
              />
              {parsedPreview.length > 0 ? (
                <p className="hint">{pick(language, `Se detectaron ${parsedPreview.length} capítulos.`, `Detected ${parsedPreview.length} chapters.`, `Detectáronse ${parsedPreview.length} capítulos.`)}</p>
              ) : null}
              <button type="button" className="btn btn-primary" disabled={busy || parsedPreview.length === 0} onClick={handleCreateChapters}>
                <Icon name="check" /> {pick(language, `Crear ${parsedPreview.length} capítulos`, `Create ${parsedPreview.length} chapters`, `Crear ${parsedPreview.length} capítulos`)}
              </button>

              <div className="chapter-or">{pick(language, "o, si no tienen título:", "or, if they have no titles:", "ou, se non teñen título:")}</div>
              <label className="book-chapter-set">
                {pick(language, "Nº de capítulos", "Number of chapters", "Nº de capítulos")}
                <input
                  type="number"
                  min={1}
                  value={numberInput || ""}
                  onChange={(event) => setNumberInput(Math.max(0, Number(event.target.value) || 0))}
                />
                <button type="button" className="btn" disabled={busy || numberInput < 1} onClick={() => handleCreateNumbered(numberInput)}>
                  {pick(language, "Crear numerados", "Create numbered", "Crear numerados")}
                </button>
              </label>
            </div>
          ) : (
            <p className="hint">{pick(language, "Quien añadió el libro aún no ha definido los capítulos.", "Whoever added the book hasn't set the chapters yet.", "Quen engadiu o libro aínda non definiu os capítulos.")}</p>
          )}

          {/* Valoración: solo cuando has marcado TODOS los capítulos */}
          {allDone ? (
            <div className="book-rating-block">
              <p className="chapter-finish-title">{pick(language, "¡Terminado! Valora el libro", "Done! Rate the book", "Rematado! Valora o libro")}</p>
              <div className="book-rating" role="radiogroup" aria-label={pick(language, "Tu valoración, de 1 a 5 estrellas", "Your rating, 1 to 5 stars", "A túa valoración, de 1 a 5 estrelas")}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={ratingInput === value}
                    className={`book-star${ratingInput >= value ? " is-on" : ""}`}
                    aria-label={pick(language, `${value} de 5 estrellas`, `${value} of 5 stars`, `${value} de 5 estrelas`)}
                    disabled={busy}
                    onClick={() => saveRating(value)}
                  >
                    <Icon name="spark" size={18} />
                  </button>
                ))}
              </div>
              <textarea
                className="book-review-input"
                rows={2}
                value={reviewInput}
                onChange={(event) => setReviewInput(event.target.value)}
                placeholder={pick(language, "Reseña (opcional). Se verá cuando todos terminen.", "Review (optional). Shown when everyone finishes.", "Reseña (opcional).")}
              />
              <button type="button" className="btn" disabled={busy} onClick={handleFinish}>
                {pick(language, "Guardar reseña", "Save review", "Gardar reseña")}
              </button>
            </div>
          ) : named ? (
            <p className="hint chapter-rating-hint">{pick(language, "La valoración aparece cuando marcas todos los capítulos.", "Rating appears once you've checked every chapter.", "A valoración aparece cando marcas todos os capítulos.")}</p>
          ) : null}
        </section>

        {/* Progreso del club */}
        <section className="page-section">
          <div className="section-head">
            <h2><Icon name="users" /> {pick(language, "Quién lo está leyendo", "Who's reading it", "Quen o está lendo")}</h2>
            {members.length > 0 ? <span className="book-progress-label">{members.length}</span> : null}
          </div>
          {members.length === 0 ? (
            <p className="hint">{pick(language, "Aún nadie. Marca un capítulo y aparecerás aquí.", "Nobody yet. Check a chapter and you'll show up here.", "Aínda ninguén. Marca un capítulo e aparecerás aquí.")}</p>
          ) : (
            <ul className="book-members">
              {members.map((member) => (
                <li key={member.userId} className="book-member">
                  <div className="book-member-row">
                    <span>{member.alias}</span>
                    <span className="book-member-state">
                      {member.shelf === "finished" ? (
                        <>
                          {member.rating ? <span className="book-member-rating">{"★".repeat(member.rating)}</span> : null}
                          {pick(language, "Terminado", "Finished", "Rematado")}
                        </>
                      ) : total > 0 ? (
                        `${member.chaptersDone}/${total}`
                      ) : (
                        pick(language, "Leyendo", "Reading", "Lendo")
                      )}
                    </span>
                  </div>
                  {book.status === "finished" && member.review ? (
                    <p className="book-member-review">{member.review}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Comentarios */}
        <section className="page-section">
          <div className="section-head">
            <h2><Icon name="news" /> {pick(language, "Comentarios", "Comments", "Comentarios")}</h2>
          </div>
          <form
            className="book-comment-form"
            onSubmit={(event) => {
              event.preventDefault();
              const clean = commentText.trim();
              if (!clean) return;
              const ch = commentChapter || undefined;
              setCommentText("");
              setCommentChapter("");
              void handleAddComment(clean, ch);
            }}
          >
            <MentionTextarea
              value={commentText}
              onChange={setCommentText}
              members={clubMembers}
              rows={2}
              placeholder={pick(language, "Comenta. Usa @nombre para mencionar. Sin spoilers 👀", "Comment. Use @name to mention. No spoilers 👀", "Comenta. Usa @nome para mencionar. Sen spoilers 👀")}
            />
            <div className="book-comment-foot">
              {named ? (
                <label className="comment-chapter-pick">
                  {pick(language, "Sobre:", "About:", "Sobre:")}
                  <select value={commentChapter} onChange={(event) => setCommentChapter(event.target.value)} className="settings-select">
                    <option value="">{pick(language, "El libro (general)", "The book (general)", "O libro (xeral)")}</option>
                    {chapters.map((c, i) => (
                      <option key={c.id} value={c.id}>{pick(language, `Capítulo ${i + 1}`, `Chapter ${i + 1}`, `Capítulo ${i + 1}`)}</option>
                    ))}
                  </select>
                </label>
              ) : <span />}
              <button type="submit" className="btn btn-primary" disabled={busy || !commentText.trim()}>
                {pick(language, "Enviar", "Send", "Enviar")}
              </button>
            </div>
            {commentChapter ? (
              <p className="hint comment-chapter-warn">{pick(language, "Solo lo verán quienes hayan leído ese capítulo.", "Only members who've read that chapter will see it.", "Só o verán quen lese ese capítulo.")}</p>
            ) : null}
          </form>
          {comments.length === 0 ? (
            <p className="hint">{pick(language, "Sé quien abre el debate. ¿Qué esperas de este libro?", "Be the one to open the debate. What do you expect from this book?", "Sé quen abre o debate. Que esperas deste libro?")}</p>
          ) : (
            <CommentThread
              comments={comments}
              members={clubMembers}
              activeUserId={activeUser.id}
              readChapterIds={readChapterIds}
              chapterLabelById={chapterLabelById}
              onReply={handleReply}
              onReact={handleReact}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
            />
          )}
        </section>
      </div>
    </main>
  );
};
