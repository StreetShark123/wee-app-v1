import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChapterTimeline } from "../components/ChapterTimeline";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { pick, useI18n } from "../lib/i18n";
import { parseChapterList } from "../lib/parseChapters";
import {
  addBookComment,
  addChapterNote,
  finishBook,
  getClubBook,
  setBookChaptersList,
  setBookFeatured,
  toggleChapter,
  type BookDetail
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
  const [ratingInput, setRatingInput] = useState(0);
  const [commentText, setCommentText] = useState("");

  const load = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const data = await getClubBook(bookId);
      setDetail(data);
      setRatingInput(data.myMember?.rating ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : pick(language, "No se pudo cargar el libro.", "Couldn't load the book.", "Non se puido cargar o libro."));
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
        <section className="page-section narrow">
          <p className="hint">{pick(language, "Cargando libro", "Loading book", "Cargando libro")}<span className="loading-dots" aria-hidden="true" /></p>
        </section>
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

  const { book, comments, members, myMember, chapters } = detail;
  const named = chapters.length > 0;
  const total = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.doneByMe).length;
  const canSetChapters = book.addedBy === activeUser.id || activeUser.role === "admin";
  const isAdmin = activeUser.role === "admin";
  const handleFeature = (featured: "gold" | "silver" | null) => run(() => setBookFeatured(book.id, featured));
  const progressPct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;
  const parsedPreview = parseChapterList(chaptersRaw);

  const handleToggle = (chapterId: string, done: boolean) => run(() => toggleChapter(chapterId, done));
  const handleAddNote = async (chapterId: string, text: string, kind: "note" | "reference") => {
    await addChapterNote(chapterId, text, kind);
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

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenAddBook} onLogout={onLogout} />

      <div className="book-detail">
        <button type="button" className="btn book-back" onClick={() => navigate("/home")}>
          <Icon name="arrowLeft" /> {pick(language, "Estantería", "Shelf", "Estantería")}
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
            {book.featured ? (
              <span className={`book-flag book-flag-${book.featured} book-flag-inline`}>
                {book.featured === "gold"
                  ? pick(language, "Lectura actual del club", "Club's current read", "Lectura actual do club")
                  : pick(language, "Siguiente lectura", "Up next", "Seguinte lectura")}
              </span>
            ) : null}
            {isAdmin ? (
              <div className="book-feature-controls">
                <span className="hint">{pick(language, "Destacar en el club:", "Feature in the club:", "Destacar no club:")}</span>
                <button type="button" className={`btn book-feature-btn gold${book.featured === "gold" ? " is-on" : ""}`} disabled={busy} onClick={() => handleFeature(book.featured === "gold" ? null : "gold")}>
                  {pick(language, "Principal", "Primary", "Principal")}
                </button>
                <button type="button" className={`btn book-feature-btn silver${book.featured === "silver" ? " is-on" : ""}`} disabled={busy} onClick={() => handleFeature(book.featured === "silver" ? null : "silver")}>
                  {pick(language, "Secundaria", "Secondary", "Secundaria")}
                </button>
              </div>
            ) : null}
          </div>
        </section>

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
              <ChapterTimeline
                chapters={chapters}
                busy={busy}
                onToggle={handleToggle}
                onAddNote={handleAddNote}
              />
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
            </div>
          ) : (
            <p className="hint">{pick(language, "Quien añadió el libro aún no ha definido los capítulos.", "Whoever added the book hasn't set the chapters yet.", "Quen engadiu o libro aínda non definiu os capítulos.")}</p>
          )}

          {/* Terminar + valoración (1-5) */}
          {named && myMember?.shelf !== "finished" ? (
            <button type="button" className="btn btn-primary chapter-finish" disabled={busy} onClick={() => run(() => finishBook(book.id, ratingInput || undefined))}>
              <Icon name="check" /> {pick(language, "Marcar libro como terminado", "Mark book as finished", "Marcar libro como rematado")}
            </button>
          ) : null}
          <div className="book-rating">
            <span>{pick(language, "Tu valoración", "Your rating", "A túa valoración")}:</span>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`book-star${ratingInput >= value ? " is-on" : ""}`}
                aria-label={`${value}`}
                disabled={busy}
                onClick={() => {
                  setRatingInput(value);
                  void run(() => finishBook(book.id, value));
                }}
              >
                <Icon name="spark" size={16} />
              </button>
            ))}
          </div>
        </section>

        {/* Progreso del club */}
        <section className="page-section">
          <div className="section-head">
            <h2><Icon name="users" /> {pick(language, "El club", "The club", "O club")}</h2>
          </div>
          {members.length === 0 ? (
            <p className="hint">{pick(language, "Nadie ha empezado todavía.", "Nobody has started yet.", "Ninguén empezou aínda.")}</p>
          ) : (
            <ul className="book-members">
              {members.map((member) => (
                <li key={member.userId}>
                  <span>{member.alias}</span>
                  <span className="book-member-state">
                    {member.shelf === "finished"
                      ? pick(language, "Terminado", "Finished", "Rematado")
                      : total > 0
                        ? `${member.chaptersDone}/${total}`
                        : pick(language, "Leyendo", "Reading", "Lendo")}
                  </span>
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
