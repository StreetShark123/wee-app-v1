import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChapterTimeline } from "../components/ChapterTimeline";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { pick, useI18n } from "../lib/i18n";
import { parseChapterList } from "../lib/parseChapters";
import { getCachedBook, setCachedBook } from "../lib/booksCache";
import { BookDetailSkeleton } from "../components/Skeletons";
import {
  addBookComment,
  addChapterNote,
  completeAllChapters,
  finishBook,
  getClubBook,
  setBookChaptersList,
  setBookFeatured,
  setBookStatus,
  toggleChapter,
  updateBook,
  voteBook,
  type BookDetail,
  type BookStatus,
  type BookVote
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
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ title: "", author: "", coverUrl: "", description: "" });

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

  const afterMutation = async () => {
    await load();
    onBooksChanged();
  };

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await afterMutation();
    } catch {
      // el reload reflejará el estado real
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

  const { book, comments, members, myMember, chapters, votes } = detail;
  const named = chapters.length > 0;
  const total = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.doneByMe).length;
  const allDone = total > 0 && doneCount === total;
  const handleVote = (vote: BookVote) => run(() => voteBook(book.id, vote));
  const handleStatus = (status: BookStatus) => run(() => setBookStatus(book.id, status));
  const handleCompleteAll = (done: boolean) => run(() => completeAllChapters(book.id, done));
  const saveRating = (value: number) => {
    setRatingInput(value);
    void run(() => finishBook(book.id, value, reviewInput.trim() || undefined));
  };
  const canSetChapters = book.addedBy === activeUser.id || activeUser.role === "admin";
  const isAdmin = activeUser.role === "admin";
  const handleFeature = (featured: "gold" | "silver" | null) => run(() => setBookFeatured(book.id, featured));
  const openEdit = () => {
    setEdit({ title: book.title, author: book.author ?? "", coverUrl: book.coverUrl ?? "", description: book.description ?? "" });
    setEditOpen(true);
  };
  const handleSaveEdit = () => {
    void run(async () => {
      await updateBook(book.id, {
        title: edit.title.trim() || book.title,
        author: edit.author.trim() || null,
        coverUrl: edit.coverUrl.trim() || null,
        description: edit.description.trim() || null
      });
      setEditOpen(false);
    });
  };
  const progressPct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;
  const parsedPreview = parseChapterList(chaptersRaw);

  const handleToggle = (chapterId: string, done: boolean) => run(() => toggleChapter(chapterId, done));
  const handleAddNote = async (chapterId: string, text: string, kind: "note" | "reference", imageUrl?: string) => {
    await addChapterNote(chapterId, text, kind, imageUrl);
    await afterMutation();
  };
  const handleCreateChapters = () => {
    const titles = parseChapterList(chaptersRaw);
    if (titles.length === 0) return;
    void run(async () => {
      await setBookChaptersList(book.id, titles);
      setChaptersRaw("");
    });
  };
  const handleCreateNumbered = (count: number) => {
    if (count < 1) return;
    const titles = Array.from({ length: Math.min(400, count) }, (_, i) =>
      pick(language, `Capítulo ${i + 1}`, `Chapter ${i + 1}`, `Capítulo ${i + 1}`)
    );
    void run(() => setBookChaptersList(book.id, titles));
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
            {book.featured === "gold" ? (
              <span className="book-flag book-flag-gold book-flag-inline">
                {pick(language, "Lectura principal del club", "Club's main read", "Lectura principal do club")}
              </span>
            ) : null}
            {isAdmin ? (
              <div className="book-admin-controls">
                <div className="book-feature-controls">
                  <span className="hint">{pick(language, "Estado:", "Status:", "Estado:")}</span>
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
                    <Icon name="spark" size={13} /> {book.featured === "gold" ? pick(language, "Quitar principal", "Unset main", "Quitar principal") : pick(language, "Marcar principal", "Set as main", "Marcar principal")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {canSetChapters && !editOpen ? (
              <button type="button" className="btn book-edit-toggle" onClick={openEdit}>
                <Icon name="pencil" size={13} /> {pick(language, "Editar libro / portada", "Edit book / cover", "Editar libro / portada")}
              </button>
            ) : null}
          </div>
        </section>

        {editOpen ? (
          <section className="page-section book-edit-form">
            <div className="section-head">
              <h2><Icon name="pencil" /> {pick(language, "Editar libro", "Edit book", "Editar libro")}</h2>
            </div>
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
          </section>
        ) : null}

        {/* Votación de la propuesta */}
        {book.status === "proposed" ? (
          <section className="page-section book-vote">
            <div className="section-head">
              <h2><Icon name="check" /> {pick(language, "¿Lo leemos?", "Shall we read it?", "Lémolo?")}</h2>
            </div>
            <p className="hint">{pick(language, "Vota si el club lee este libro. Cuando todos digan \"sí\", pasa a 'en lectura'.", "Vote whether the club reads this. When everyone says \"yes\", it moves to 'reading'.", "Vota se o club le este libro. Cando todos digan \"si\", pasa a 'en lectura'.")}</p>
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
                  <button type="button" className="btn" disabled={busy || parsedPreview.length === 0} onClick={handleCreateChapters}>
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
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => finishBook(book.id, ratingInput || undefined, reviewInput.trim() || undefined))}>
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
              void run(async () => {
                await addBookComment(book.id, clean);
                setCommentText("");
              });
            }}
          >
            <textarea
              rows={2}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder={pick(language, "Escribe un comentario (sin spoilers 👀)", "Write a comment (no spoilers 👀)", "Escribe un comentario (sen spoilers 👀)")}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !commentText.trim()}>
              {pick(language, "Enviar", "Send", "Enviar")}
            </button>
          </form>
          {comments.length === 0 ? (
            <p className="hint">{pick(language, "Sé el primero en comentar.", "Be the first to comment.", "Sé o primeiro en comentar.")}</p>
          ) : (
            <ul className="book-comments">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <strong>{comment.alias}</strong>
                  <p>{comment.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
};
