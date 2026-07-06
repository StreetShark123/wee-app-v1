import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ChapterTimeline } from "../components/ChapterTimeline";
import { GeneratedCover } from "../components/GeneratedCover";
import { Icon } from "../components/Icon";
import { PunctuationLoader } from "../components/PunctuationLoader";
import { ReadersModal } from "../components/ReadersModal";
import { UserDot, styleFor } from "../components/UserBadge";
import { pick, useI18n } from "../lib/i18n";
import { useConfirm } from "../lib/confirm";
import { parseChapterList } from "../lib/parseChapters";
import { getCachedBook, setCachedBook } from "../lib/booksCache";
import { isFresh, markFetched } from "../lib/freshness";
import { NoteThread } from "../components/CommentThread";
import { ImageLightbox } from "../components/ImageLightbox";
import { MeetingCard } from "../components/MeetingCard";
import { ReadingPace } from "../components/ReadingPace";
import { MentionTextarea } from "../components/MentionTextarea";
import { applyVoteLocal } from "../components/VoteControl";
import {
  addBookComment,
  addChapterNote,
  updateChapterNote,
  deleteChapterNote,
  completeAllChapters,
  reactComment,
  reactNote,
  updateComment,
  deleteComment,
  pinComment,
  deleteBook,
  finishBook,
  getClubBook,
  proposalQuorum,
  remindReading,
  remindVoters,
  rsvpMeeting,
  setBookMeeting,
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
  type ChapterNote,
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
  if (status === "rejected") return pick(language, "Descartado", "Declined", "Descartado");
  return pick(language, "Propuesto", "Proposed", "Proposto");
};

export const BookDetailPage = ({ activeUser, onOpenAddBook, onLogout, onBooksChanged }: BookDetailPageProps) => {
  const { language } = useI18n();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const { bookId } = useParams<{ bookId: string }>();
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chaptersRaw, setChaptersRaw] = useState("");
  const [numberInput, setNumberInput] = useState(0);
  const [ratingInput, setRatingInput] = useState(0);
  const [reviewInput, setReviewInput] = useState("");
  // Borrador local del comentario (por libro): si la red falla o se cierra la
  // app a mitad, el texto no se pierde. Se limpia al publicar (texto vacío).
  const [commentText, setCommentText] = useState(() => {
    try {
      return localStorage.getItem(`wee:draft:comment:${bookId}`) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (commentText.trim()) localStorage.setItem(`wee:draft:comment:${bookId}`, commentText);
      else localStorage.removeItem(`wee:draft:comment:${bookId}`);
    } catch {
      // storage lleno/bloqueado: el borrador simplemente no persiste
    }
  }, [commentText, bookId]);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ title: "", author: "", coverUrl: "", description: "" });
  const [targetCh, setTargetCh] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [minutesPerDay, setMinutesPerDay] = useState(30);
  const [calcPreview, setCalcPreview] = useState<{ date: string; days: number } | null>(null);
  const [coverLightbox, setCoverLightbox] = useState(false);
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [readersOpen, setReadersOpen] = useState(false);

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

  // Refresco "social": notas/comentarios nuevos aparecen sin recargar a mano. Silencioso
  // (sin spinner ni error), al volver el foco/visibilidad y cada 20s con la pestaña visible.
  // No pisa una mutación en curso (busyRef).
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    if (!bookId) return;
    const freshKey = `book:${bookId}`;
    const refresh = async (force = false) => {
      if (document.hidden || busyRef.current) return;
      // Ventana de frescura: el detalle pesa (capítulos+notas+comentarios+
      // miembros) y los eventos de foco se disparan a pares en iOS — si el
      // dato tiene <30s, no gastamos red (dieta de egress).
      if (!force && isFresh(freshKey, 30000)) return;
      try {
        const data = await getClubBook(bookId);
        markFetched(freshKey);
        setDetail(data);
        setCachedBook(bookId, data);
      } catch { /* silencioso */ }
    };
    const onFocus = () => { void refresh(); };
    // Tirar-para-refrescar (App emite `wee:refresh`): fuerza recarga del detalle.
    const onPull = () => { void refresh(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("wee:refresh", onPull);
    const id = window.setInterval(() => { void refresh(true); }, 60000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("wee:refresh", onPull);
      window.clearInterval(id);
    };
  }, [bookId]);

  // Si venimos de una notificación o del feed (#c-<id> comentario, #note-<id> nota,
  // #ch-<id> capítulo), salta y resalta ese elemento UNA sola vez. El objetivo puede
  // tardar en montarse (auto-expansión del capítulo/nota), así que reintentamos.
  // Guard por hash: si no, cada cambio de `detail` (p.ej. añadir una nota) re-dispararía
  // el salto y te reenviaría al elemento.
  const handledHashRef = useRef<string | null>(null);
  useEffect(() => {
    const h = location.hash;
    if (!detail || !(h.startsWith("#c-") || h.startsWith("#note-") || h.startsWith("#ch-"))) return;
    if (handledHashRef.current === location.hash) return;
    handledHashRef.current = location.hash;
    const elId = location.hash.slice(1);
    let tries = 0;
    let timer = 0;
    let flashTimer = 0;
    const tick = () => {
      const el = document.getElementById(elId);
      if (el) {
        // Si el objetivo (nota/capítulo) cuelga de un <details> colapsado
        // (caso "libro entero leído"), ábrelo para que sea visible el scroll.
        el.closest("details")?.setAttribute("open", "");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("comment-flash");
        flashTimer = window.setTimeout(() => el.classList.remove("comment-flash"), 2200);
        return;
      }
      if (tries++ < 12) timer = window.setTimeout(tick, 150);
    };
    timer = window.setTimeout(tick, 120);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(flashTimer);
    };
  }, [detail, location.hash]);

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
    // Primera carga (sin caché): glifo de puntuación a pantalla completa, sin
    // esqueletos. Cacheada → load() pinta al instante y este bloque ni se ve.
    return <PunctuationLoader />;
  }

  if (error || !detail) {
    return (
      <main>
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

  const { book, comments, members, myMember, chapters, votes, activeMemberCount, clubMembers, meetingRsvp } = detail;
  // Decisión por quórum de VOTANTES: gana la mayoría simple una vez que vota al
  // menos un tercio del club. Lo que falta son votos (de cualquier signo), no síes.
  const quorum = proposalQuorum(activeMemberCount);
  // Días que faltan para que el plazo resuelva la propuesta por sí solo.
  const deadlineDaysLeft = book.voteDeadline ? Math.ceil((book.voteDeadline - Date.now()) / 86400000) : null;
  const votersCount = votes.yes + votes.no;
  const votesNeeded = Math.max(0, quorum - votersCount);
  const quorumReached = votersCount >= quorum;
  const named = chapters.length > 0;
  const total = chapters.length;
  const doneCount = chapters.filter((chapter) => chapter.doneByMe).length;
  const allDone = total > 0 && doneCount === total;

  // Recursos del libro: todos los enlaces aportados en comentarios y notas, juntos
  // en un solo sitio (antes se perdían en el scroll). Deriva de datos ya cargados.
  const resources = (() => {
    const urlRe = /(https?:\/\/[^\s<>"')]+)/g;
    const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
    const seen = new Set<string>();
    const out: Array<{ url: string; alias: string; host: string }> = [];
    const push = (text: string | undefined, alias: string): void => {
      (String(text ?? "").match(urlRe) ?? []).forEach((raw) => {
        const url = raw.replace(/[.,);]+$/, "");
        if (seen.has(url)) return;
        seen.add(url);
        out.push({ url, alias, host: hostOf(url) });
      });
    };
    comments.forEach((c) => { if (!c.deleted) push(c.text, c.alias); });
    chapters.forEach((ch) => ch.notes.forEach((n) => {
      push(n.text, n.alias);
      if (n.imageUrl && !seen.has(n.imageUrl)) { seen.add(n.imageUrl); out.push({ url: n.imageUrl, alias: n.alias, host: hostOf(n.imageUrl) }); }
    }));
    return out;
  })();
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
  const handleSetMeeting = async (input: { meetingAt?: string | null; meetingUrl?: string | null; meetingPlace?: string | null }) => {
    await run(async () => {
      const r = await setBookMeeting(book.id, input);
      patch((d) => ({ ...d, book: { ...d.book, meetingAt: r.book.meetingAt, meetingUrl: r.book.meetingUrl, meetingPlace: r.book.meetingPlace } }));
    });
  };
  const handleRsvp = (status: "yes" | "no" | null) =>
    run(async () => {
      const r = await rsvpMeeting(book.id, status);
      patch((d) => ({ ...d, meetingRsvp: r.rsvp }));
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
  const isAdder = book.addedBy === activeUser.id;
  const canDelete = isAdmin || (isAdder && book.status === "proposed");
  const handleDeleteBook = async () => {
    const ok = await confirm({
      title: pick(language, `¿Eliminar "${book.title}"?`, `Delete "${book.title}"?`, `Eliminar "${book.title}"?`),
      message: pick(language, "Se borrará para todo el club y no se puede deshacer.", "It will be removed for the whole club and can't be undone.", "Borrarase para todo o club e non se pode desfacer."),
      confirmLabel: pick(language, "Eliminar libro", "Delete book", "Eliminar libro"),
      danger: true
    });
    if (!ok) return;
    void deleteBook(book.id)
      .then(() => {
        onBooksChanged();
        navigate("/home");
      })
      .catch(() => void load());
  };
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
  const handleToggleNumbering = () =>
    run(async () => {
      const r = await updateBook(book.id, { numberChapters: !(book.numberChapters !== false) });
      patch((d) => ({ ...d, book: r.book }));
    });
  const progressPct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;
  const parsedPreview = parseChapterList(chaptersRaw);
  const daysLeft = book.targetDate ? Math.ceil((new Date(`${book.targetDate}T23:59:59`).getTime() - Date.now()) / 86400000) : null;
  const hasCadence = book.status === "reading" && (book.targetChapter || book.targetDate);
  // Cuando la cita ya llegó (o el libro está terminado) toca hablar: se levanta el
  // anti-spoiler y sale un banner que empuja a la conversación.
  const meetingArrived = book.meetingAt != null && book.meetingAt <= Date.now();
  const spoilersOk = book.status === "finished" || meetingArrived;
  // Hilos inline por nota: noteId → comentarios del hilo (raíces con ese noteId + sus
  // respuestas). El resto va a la "discusión general" de abajo.
  const noteThreads = (() => {
    const rootNote = new Map<string, string>();
    comments.forEach((c) => { if (!c.parentId && c.noteId) rootNote.set(c.id, c.noteId); });
    const m = new Map<string, typeof comments>();
    const push = (noteId: string, c: (typeof comments)[number]) => {
      const arr = m.get(noteId) ?? [];
      arr.push(c);
      m.set(noteId, arr);
    };
    comments.forEach((c) => {
      if (!c.parentId && c.noteId) push(c.noteId, c);
      else if (c.parentId && rootNote.has(c.parentId)) push(rootNote.get(c.parentId) as string, c);
    });
    return m;
  })();
  const noteCommentIds = new Set<string>();
  noteThreads.forEach((arr) => arr.forEach((c) => noteCommentIds.add(c.id)));
  const generalComments = comments.filter((c) => !noteCommentIds.has(c.id));
  // Conversación unificada: la discusión de la PROPUESTA (phase==="proposed") se pliega
  // en un archivo colapsable una vez el libro sale de "propuesto"; el resto es la
  // conversación viva del club. Sin secciones de comentarios duplicadas por fase.
  const proposalComments = generalComments.filter((c) => c.phase === "proposed");
  const clubComments = generalComments.filter((c) => c.phase !== "proposed");
  const isProposalPhase = book.status === "proposed";
  const lastReadChapterId = [...chapters].reverse().find((c) => c.doneByMe)?.id ?? null;
  // Comentario objetivo si venimos de una notificación (#c-<id>): para auto-abrir su hilo.
  const focusCommentId = location.hash.startsWith("#c-") ? location.hash.slice(3) : null;
  // Nota objetivo si venimos del feed (#note-<id>): para auto-abrir su capítulo + revelarla.
  const focusNoteId = location.hash.startsWith("#note-") ? location.hash.slice(6) : null;
  const handleCommentOnNote = (noteId: string, text: string) =>
    run(async () => {
      const { comment } = await addBookComment(book.id, text, { noteId });
      patch((d) => ({ ...d, comments: [...d.comments, comment] }));
    });
  // Reacción a una nota: optimista en su nota, sin recargar la ficha.
  const handleReactNote = (noteId: string, emoji: string) => {
    const apply = (reactionsOf: (n: ChapterNote) => CommentReaction[]) =>
      setDetail((prev) =>
        prev
          ? { ...prev, chapters: prev.chapters.map((c) => ({ ...c, notes: c.notes.map((n) => (n.id === noteId ? { ...n, reactions: reactionsOf(n) } : n)) })) }
          : prev
      );
    apply((n) => applyVoteLocal(n.reactions ?? [], emoji as "up" | "down"));
    void reactNote(noteId, emoji)
      .then(({ reactions }) => apply(() => reactions))
      .catch(() => void load());
  };

  // ── Cálculo de cadencia (estimación de páginas + ritmo por minutos/día) ──
  const MIN_PER_PAGE = 2; // ~2 min por página de prosa
  const totalChapters = chapters.length || book.totalChapters || 0;
  const knownPages = !!book.pageCount && totalChapters > 0;
  const pagesPerChapter = knownPages ? (book.pageCount as number) / totalChapters : 18;
  const targetChNum = Number(targetCh) || 0;
  const pagesToTarget = targetChNum > 0 ? Math.round(pagesPerChapter * targetChNum) : 0;
  const pagesPerDay = Math.max(1, minutesPerDay / MIN_PER_PAGE);
  const daysFromPace = pagesToTarget > 0 ? Math.max(1, Math.ceil(pagesToTarget / pagesPerDay)) : 0;
  const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const suggestedDate = daysFromPace > 0 ? isoDate(Date.now() + daysFromPace * 86400000) : "";
  const daysUntilTarget = targetDate ? Math.max(1, Math.ceil((new Date(`${targetDate}T23:59:59`).getTime() - Date.now()) / 86400000)) : 0;
  const impliedMinPerDay = daysUntilTarget > 0 && pagesToTarget > 0 ? Math.round((pagesToTarget / daysUntilTarget) * MIN_PER_PAGE) : 0;
  const paceLabel = (m: number): string =>
    m <= 0 ? "" : m < 20 ? pick(language, "relajado", "relaxed", "relaxado") : m <= 45 ? pick(language, "cómodo", "comfy", "cómodo") : m <= 90 ? pick(language, "exigente", "demanding", "esixente") : pick(language, "muy intenso", "very intense", "moi intenso");

  // #5: meta para TERMINAR el libro a X min/día (ritmo de lector medio ~2 min/pág),
  // desde hoy, redondeando hacia arriba y con un pequeño margen.
  const totalPagesBook = book.pageCount && book.pageCount > 0 ? book.pageCount : Math.round(pagesPerChapter * totalChapters);
  const wholeBookDays = totalPagesBook > 0 ? Math.ceil(totalPagesBook / pagesPerDay) : 0;
  const wholeBookDaysMargin = wholeBookDays > 0 ? wholeBookDays + Math.max(1, Math.ceil(wholeBookDays * 0.15)) : 0;
  const wholeBookDate = wholeBookDaysMargin > 0 ? isoDate(Date.now() + wholeBookDaysMargin * 86400000) : "";
  const humanDate = (iso: string): string => {
    if (!iso) return "";
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString(language === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "long", year: "numeric" });
  };
  const acceptWholeBookCadence = () => {
    if (!calcPreview) return;
    const ch = totalChapters || null;
    setTargetCh(totalChapters ? String(totalChapters) : "");
    setTargetDate(calcPreview.date);
    void run(async () => {
      const r = await setBookTarget(book.id, { targetChapter: ch, targetDate: calcPreview.date });
      patch((d) => ({ ...d, book: r.book }));
    });
    setCalcPreview(null);
  };

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
  };
  const patchNote = (noteId: string, fn: (n: ChapterNote) => ChapterNote) =>
    patch((d) => ({ ...d, chapters: d.chapters.map((c) => ({ ...c, notes: c.notes.map((n) => (n.id === noteId ? fn(n) : n)) })) }));
  const handleEditNote = async (noteId: string, text: string) => {
    const { note } = await updateChapterNote(noteId, { text });
    patchNote(noteId, (n) => ({ ...n, text: note.text, editedAt: note.editedAt ?? Date.now() }));
  };
  const handleDeleteNote = async (noteId: string) => {
    const ok = await confirm({
      title: pick(language, "¿Borrar esta nota?", "Delete this note?", "Borrar esta nota?"),
      confirmLabel: pick(language, "Borrar", "Delete", "Borrar"),
      danger: true
    });
    if (!ok) return;
    patch((d) => ({ ...d, chapters: d.chapters.map((c) => ({ ...c, notes: c.notes.filter((n) => n.id !== noteId) })) }));
    void deleteChapterNote(noteId).catch(() => void load());
  };
  const handleReply = async (parentId: string, text: string) => {
    const { comment } = await addBookComment(book.id, text, { parentId });
    patch((d) => ({ ...d, comments: [...d.comments, comment] }));
  };
  const handleAddComment = (text: string, chapterId?: string) =>
    run(async () => {
      const { comment } = await addBookComment(book.id, text, { chapterId });
      patch((d) => ({ ...d, comments: [...d.comments, comment] }));
    });
  const handleEditComment = async (commentId: string, text: string) => {
    const r = await updateComment(commentId, text);
    patch((d) => ({ ...d, comments: d.comments.map((c) => (c.id === commentId ? { ...c, text, editedAt: r.editedAt ?? Date.now() } : c)) }));
  };
  const handleDeleteComment = (commentId: string) => {
    void deleteComment(commentId)
      .then((r) => {
        if (r.mode === "soft") {
          // Borrado suave: deja lápida y conserva el hilo de respuestas.
          patch((d) => ({ ...d, comments: d.comments.map((c) => (c.id === commentId ? { ...c, deleted: true, text: "", reactions: [] } : c)) }));
        } else {
          patch((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== commentId && c.parentId !== commentId) }));
        }
      })
      .catch(() => void load());
  };

  const handlePinComment = (commentId: string, pinned: boolean) => {
    patch((d) => ({ ...d, comments: d.comments.map((c) => (c.id === commentId ? { ...c, pinned } : c)) }));
    void pinComment(commentId, pinned).catch(() => void load());
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
        ? { ...prev, comments: prev.comments.map((c) => (c.id === commentId ? { ...c, reactions: applyVoteLocal(c.reactions, emoji as "up" | "down") } : c)) }
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
  const confirmReset = (): Promise<boolean> => {
    if (chapters.length === 0) return Promise.resolve(true);
    const affected = members.filter((m) => (m.chaptersDone ?? 0) > 0).length;
    const who = affected === 0
      ? pick(language, "Nadie ha empezado todavía.", "Nobody has started yet.", "Aínda non empezou ninguén.")
      : affected === 1
        ? pick(language, "1 persona perderá su progreso.", "1 person will lose their progress.", "1 persoa perderá o seu progreso.")
        : pick(language, `${affected} personas perderán su progreso.`, `${affected} people will lose their progress.`, `${affected} persoas perderán o seu progreso.`);
    return confirm({
      title: pick(language, "¿Redefinir los capítulos?", "Redefine the chapters?", "Redefinir os capítulos?"),
      message: pick(language, `Reemplaza la lista y REINICIA el progreso del club. ${who}`, `Replaces the list and RESETS the club's progress. ${who}`, `Substitúe a lista e REINICIA o progreso do club. ${who}`),
      confirmLabel: pick(language, "Reemplazar", "Replace", "Substituír"),
      danger: true
    });
  };
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
  const handleCreateChapters = async () => {
    const titles = parseChapterList(chaptersRaw);
    if (titles.length === 0 || !(await confirmReset())) return;
    void applyChapters(titles);
  };
  const handleCreateNumbered = async (count: number) => {
    if (count < 1 || !(await confirmReset())) return;
    void applyChapters(
      Array.from({ length: Math.min(400, count) }, (_, i) => pick(language, `Capítulo ${i + 1}`, `Chapter ${i + 1}`, `Capítulo ${i + 1}`))
    );
  };

  return (
    <main>
      <div className="book-detail">
        <div className="book-action-bar">
          <button type="button" className="book-back" onClick={() => navigate("/home")}>
            <Icon name="arrowLeft" size={14} /> {pick(language, "Estantería del club", "Club shelf", "Estantería do club")}
          </button>
        </div>

        <section className="page-section book-detail-head">
          {coverLightbox && book.coverUrl ? <ImageLightbox url={book.coverUrl} onClose={() => setCoverLightbox(false)} showVisit={false} /> : null}
          {readersOpen ? <ReadersModal members={members} total={total} bookStatus={book.status} clubMembers={clubMembers} onClose={() => setReadersOpen(false)} /> : null}

          {/* Editar anclado a la esquina del héroe (no sobre la portada, que lo
              recortaba visualmente). */}
          {isAdmin && !editOpen ? (
            <button type="button" className="book-edit-corner" onClick={openEdit} aria-label={pick(language, "Editar libro", "Edit book", "Editar libro")} title={pick(language, "Editar", "Edit", "Editar")}>
              <Icon name="pencil" size={14} />
            </button>
          ) : null}

          <div className="book-head-top">
            <div className="book-head-info">
              <div className="book-status-row">
                <span className={`book-card-status book-card-status-${book.status}`}>{statusLabel(book.status, language)}</span>
                {book.featured === "gold" ? (
                  <span className="book-featured-tag"><Icon name="star" size={12} /> {pick(language, "Destacado", "Featured", "Destacado")}</span>
                ) : null}
              </div>
              <h1>{book.title}</h1>
              <p className="book-detail-author">
                {book.author ? (
                  book.authorUrl ? (
                    <a className="book-author-link" href={book.authorUrl} target="_blank" rel="noopener noreferrer nofollow" title={pick(language, `Más sobre ${book.author}`, `More about ${book.author}`, `Máis sobre ${book.author}`)}>
                      {book.author}
                    </a>
                  ) : (
                    book.author
                  )
                ) : (
                  pick(language, "Autor desconocido", "Unknown author", "Autor descoñecido")
                )}
              </p>
              {book.publishedYear || book.pageCount ? (
                <p className="book-detail-metaline">
                  {[
                    book.publishedYear ? String(book.publishedYear) : null,
                    book.pageCount ? pick(language, `${book.pageCount} págs.`, `${book.pageCount} pp.`, `${book.pageCount} páxs.`) : null
                  ].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>

            <div className="book-cover-wrap">
              {book.coverUrl ? (
                <button type="button" className="book-cover book-cover-lg book-cover-btn" onClick={() => setCoverLightbox(true)} aria-label={pick(language, "Ver portada", "View cover", "Ver portada")}>
                  <img src={book.coverUrl} alt="" />
                </button>
              ) : (
                <GeneratedCover className="book-cover book-cover-lg" size="lg" title={book.title} author={book.author} />
              )}
            </div>
          </div>

          <div className="book-head-rest">
            {(book.status === "reading" || book.status === "finished") && members.length > 0 ? (
              <button type="button" className="book-readers-row" onClick={() => setReadersOpen(true)} aria-label={pick(language, "Ver quién lo está leyendo", "See who's reading it", "Ver quen o está lendo")}>
                <span className="book-readers-stack">
                  {members.slice(0, 5).map((m) => (
                    <UserDot key={m.userId} alias={m.alias} {...styleFor(clubMembers, m.userId)} />
                  ))}
                </span>
                <span className="book-readers-label">
                  {members.length > 5 ? `+${members.length - 5} · ` : ""}
                  {pick(language, `${members.length} leyendo`, `${members.length} reading`, `${members.length} lendo`)}
                </span>
              </button>
            ) : null}
            {book.description ? (
              <div className={`book-detail-synopsis${synopsisOpen ? " is-open" : ""}`}>
                <p>{book.description}</p>
                {book.description.length > 260 ? (
                  <button type="button" className="book-synopsis-toggle" aria-expanded={synopsisOpen} onClick={() => setSynopsisOpen((v) => !v)}>
                    {synopsisOpen ? pick(language, "Ver menos", "Show less", "Ver menos") : pick(language, "Ver más", "Show more", "Ver máis")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {(facilitatorAlias && book.status !== "proposed") || hasCadence ? (
              <div className="book-meta-chips">
                {facilitatorAlias && book.status !== "proposed" ? (
                  <span className="book-chip"><Icon name="spark" size={12} /> {pick(language, `Propuesto por ${facilitatorAlias}`, `Proposed by ${facilitatorAlias}`, `Proposto por ${facilitatorAlias}`)}</span>
                ) : null}
                {(book.status === "reading" || book.status === "finished") && book.decidedBy ? (
                  <span className="book-chip">
                    <Icon name="check" size={12} /> {book.decidedBy === "vote"
                      ? pick(language, "Aprobado por votación", "Approved by vote", "Aprobado por votación")
                      : book.decidedBy === "deadline"
                        ? pick(language, "Aprobado al vencer el plazo", "Approved when the deadline passed", "Aprobado ao vencer o prazo")
                        : pick(language, "Aprobado por un admin", "Approved by an admin", "Aprobado por un admin")}
                  </span>
                ) : null}
                {hasCadence ? (
                  <span className="book-chip">
                    <Icon name="target" size={12} />{" "}
                    {book.targetChapter ? pick(language, `Meta: cap. ${book.targetChapter}`, `Goal: ch. ${book.targetChapter}`, `Meta: cap. ${book.targetChapter}`) : pick(language, "Meta esta semana", "This week's goal", "Meta esta semana")}
                    {daysLeft != null ? (
                      <span className={`book-cadence-days${daysLeft < 0 ? " is-overdue" : ""}`}>
                        {" · "}
                        {daysLeft < 0 ? pick(language, "vencida", "overdue", "vencida") : daysLeft === 0 ? pick(language, "hoy", "today", "hoxe") : pick(language, `faltan ${daysLeft} días`, `${daysLeft} days left`, `faltan ${daysLeft} días`)}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ) : null}
            {book.status === "reading" && book.targetChapter ? (
              <ReadingPace
                targetChapter={book.targetChapter}
                totalChapters={chapters.length}
                membersDone={members.map((m) => m.chaptersDone)}
                myChaptersDone={myMember?.chaptersDone ?? 0}
                canManage={isAdder || isAdmin}
                onRemind={() => remindReading(book.id)}
              />
            ) : null}
            {named ? (
              <div className="book-head-progress">
                <span className="book-card-progress">
                  <span className="book-card-progress-fill" style={{ width: `${progressPct}%` }} />
                </span>
                <span className="book-head-progress-label">{pick(language, `${doneCount}/${total} leídos`, `${doneCount}/${total} read`, `${doneCount}/${total} lidos`)}</span>
              </div>
            ) : null}
          </div>
        </section>

        {editOpen ? (
          <section className="page-section book-edit-form">
            <div className="section-head">
              <h2><Icon name="pencil" /> {pick(language, "Editar libro", "Edit book", "Editar libro")}</h2>
            </div>

            <div className="edit-fields-row">
              <label className="form-field">
                {pick(language, "Título", "Title", "Título")}
                <input value={edit.title} onChange={(event) => setEdit((prev) => ({ ...prev, title: event.target.value }))} />
              </label>
              <label className="form-field">
                {pick(language, "Autor", "Author", "Autor")}
                <input value={edit.author} onChange={(event) => setEdit((prev) => ({ ...prev, author: event.target.value }))} />
              </label>
            </div>
            <label className="form-field">
              {pick(language, "URL de la portada", "Cover image URL", "URL da portada")}
              <input type="url" value={edit.coverUrl} onChange={(event) => setEdit((prev) => ({ ...prev, coverUrl: event.target.value }))} placeholder="https://..." />
              <span className="field-help">{pick(language, "¿Portada incorrecta? Pega la URL de una imagen.", "If Google's cover is wrong, paste an image URL here.", "Se Google non trae a portada correcta, pega aquí o URL dunha imaxe.")}</span>
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

            <h3 className="edit-subhead edit-subhead-spaced">{pick(language, "Gestión de la lectura", "Reading management", "Xestión da lectura")}</h3>
            {isAdmin ? (
              <div className="book-manage">
                <div className="book-feature-controls">
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

            {/* C1/#5: cadencia inteligente — calcular meta para terminar el libro, luego aceptar */}
            <div className="book-manage book-cadence-edit">
              <span className="hint"><Icon name="target" size={13} /> {pick(language, "Meta de lectura del club", "Club reading goal", "Meta de lectura do club")}</span>

              <div className="cadence-pace">
                <label className="book-chapter-set">
                  {pick(language, "Quiero leer", "I want to read", "Quero ler")}
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={minutesPerDay}
                    onChange={(event) => { setMinutesPerDay(Math.max(5, Number(event.target.value) || 0)); setCalcPreview(null); }}
                  />
                  {pick(language, "min/día", "min/day", "min/día")}
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || totalPagesBook <= 0}
                  onClick={() => wholeBookDate && setCalcPreview({ date: wholeBookDate, days: wholeBookDaysMargin })}
                >
                  <Icon name="target" size={13} /> {pick(language, "Calcular meta", "Calculate goal", "Calcular meta")}
                </button>
              </div>

              {calcPreview ? (
                <div className="cadence-preview">
                  <p className="cadence-preview-date">
                    <Icon name="check" size={13} /> {pick(language, `Terminaríais el libro el ${humanDate(calcPreview.date)}`, `You'd finish the book by ${humanDate(calcPreview.date)}`, `Remataríades o libro o ${humanDate(calcPreview.date)}`)}
                  </p>
                  <p className="hint">
                    {pick(
                      language,
                      `~${calcPreview.days} días a ${minutesPerDay} min/día (ritmo de lector medio, con algo de margen).`,
                      `~${calcPreview.days} days at ${minutesPerDay} min/day (average reader pace, with some margin).`,
                      `~${calcPreview.days} días a ${minutesPerDay} min/día (ritmo de lector medio, con algo de marxe).`
                    )}
                  </p>
                  <div className="auth-entry-actions">
                    <button type="button" className="btn" onClick={() => setCalcPreview(null)} disabled={busy}>
                      {pick(language, "Cancelar", "Cancel", "Cancelar")}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={acceptWholeBookCadence} disabled={busy}>
                      <Icon name="check" size={13} /> {pick(language, "Aceptar meta", "Accept goal", "Aceptar meta")}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="hint">{pick(language, "Pon tus minutos y pulsa Calcular: te proponemos fecha de fin.", "Set your minutes per day and tap Calculate: we'll suggest a date to finish it together.", "Pon os teus minutos ao día e preme Calcular: proporémosche unha data para rematalo xuntos.")}</p>
              )}

              <details className="cadence-manual">
                <summary>{pick(language, "Meta manual (capítulo / fecha)", "Manual goal (chapter / date)", "Meta manual (capítulo / data)")}</summary>
                <label className="book-chapter-set">
                  {pick(language, "Leer hasta", "Read through", "Ler ata")}
                  {chapters.length > 0 ? (
                    <select value={targetCh} onChange={(event) => setTargetCh(event.target.value)} className="settings-select">
                      <option value="">{pick(language, "elige capítulo", "pick a chapter", "escolle capítulo")}</option>
                      {chapters.map((c, i) => (
                        <option key={c.id} value={i + 1}>{pick(language, `Capítulo ${i + 1}`, `Chapter ${i + 1}`, `Capítulo ${i + 1}`)}{c.title && !/^cap[íi]tulo/i.test(c.title) ? ` · ${c.title}` : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="number" min={0} value={targetCh} onChange={(event) => setTargetCh(event.target.value)} placeholder={pick(language, "nº capítulo", "chapter #", "nº capítulo")} />
                  )}
                </label>
                {targetChNum > 0 && knownPages ? (
                  <p className="hint cadence-pages">{pick(language, `≈ ${pagesToTarget} páginas hasta ahí`, `≈ ${pagesToTarget} pages to there`, `≈ ${pagesToTarget} páxinas ata aí`)}</p>
                ) : null}
                <label className="book-chapter-set">
                  {pick(language, "Para la fecha", "By date", "Para a data")}
                  <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
                </label>
                {targetDate && impliedMinPerDay > 0 ? (
                  <p className={`hint cadence-check${impliedMinPerDay > 90 ? " is-intense" : ""}`}>
                    {pick(language, `Para esa fecha: ~${impliedMinPerDay} min/día (${paceLabel(impliedMinPerDay)})`, `By that date: ~${impliedMinPerDay} min/day (${paceLabel(impliedMinPerDay)})`, `Para esa data: ~${impliedMinPerDay} min/día (${paceLabel(impliedMinPerDay)})`)}
                  </p>
                ) : null}
                <button type="button" className="btn btn-primary" disabled={busy || targetChNum < 1} onClick={handleSetTarget}>
                  {pick(language, "Fijar meta manual", "Set manual goal", "Fixar meta manual")}
                </button>
              </details>
            </div>

            {canSetChapters ? (
              <>
                <h3 className="edit-subhead edit-subhead-spaced">{pick(language, "Capítulos", "Chapters", "Capítulos")}</h3>
                <label className="chapter-number-toggle">
                  <input type="checkbox" checked={book.numberChapters !== false} disabled={busy} onChange={handleToggleNumbering} />
                  {pick(language, "Numerar los capítulos con título", "Number titled chapters", "Numerar os capítulos con título")}
                </label>
                <details className="chapter-redefine">
                  <summary>{pick(language, "Redefinir la lista de capítulos", "Redefine the chapter list", "Redefinir a lista de capítulos")}</summary>
                  <p className="hint">{pick(language, "Reemplaza la lista y reinicia el progreso de todos.", "Careful: replaces the list and resets everyone's progress.", "Ollo: substitúe a lista e reinicia o progreso de todos.")}</p>
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
              </>
            ) : null}

            {canDelete ? (
              <details className="book-manage book-delete-zone">
                <summary className="book-delete-summary"><Icon name="trash" size={13} /> {pick(language, "Zona peligrosa", "Danger zone", "Zona perigosa")}</summary>
                <p className="hint">
                  {isAdmin && book.status !== "proposed"
                    ? pick(language, "Como admin puedes eliminar este libro del club.", "As an admin you can remove this book from the club.", "Como admin podes eliminar este libro do club.")
                    : pick(language, "Puedes eliminar esta propuesta mientras no esté en lectura.", "You can remove this proposal while it isn't being read.", "Podes eliminar esta proposta mentres non estea en lectura.")}
                </p>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={handleDeleteBook}>
                  <Icon name="trash" size={13} /> {pick(language, "Eliminar libro", "Delete book", "Eliminar libro")}
                </button>
              </details>
            ) : null}
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
            <p className="hint">{pick(language, "Con un tercio del club votando, gana la mayoría. Si nadie vota, lo resuelve el plazo o un admin.", "Once a third of the club votes, the majority wins (or an admin decides). If nobody votes, the deadline resolves it.", "Cando vota un terzo do club, gaña a maioría (ou decídeo un admin). Se ninguén vota, o prazo resólveo só.")}</p>
            {activeMemberCount > 0 ? (
              <div className="vote-quorum">
                <span className="vote-quorum-bar"><span className="vote-quorum-fill" style={{ width: `${Math.min(100, Math.round((votersCount / quorum) * 100))}%` }} /></span>
                <span className="vote-quorum-label">{votes.yes} {pick(language, "sí", "yes", "si")} · {votes.no} {pick(language, "no", "no", "non")} · {pick(language, `quórum ${Math.min(votersCount, quorum)}/${quorum}`, `quorum ${Math.min(votersCount, quorum)}/${quorum}`, `quórum ${Math.min(votersCount, quorum)}/${quorum}`)}</span>
              </div>
            ) : null}
            {book.status === "proposed" && deadlineDaysLeft !== null ? (
              <p className="hint vote-deadline">
                {deadlineDaysLeft > 1
                  ? pick(language, `La votación cierra en ${deadlineDaysLeft} días`, `Voting closes in ${deadlineDaysLeft} days`, `A votación pecha en ${deadlineDaysLeft} días`)
                  : deadlineDaysLeft === 1
                    ? pick(language, "La votación cierra mañana", "Voting closes tomorrow", "A votación pecha mañá")
                    : pick(language, "La votación cierra hoy", "Voting closes today", "A votación pecha hoxe")}
              </p>
            ) : null}
            {activeMemberCount > 0 && votesNeeded > 0 ? (
              <p className="hint vote-needed">{pick(language, `${votesNeeded === 1 ? "Falta" : "Faltan"} ${votesNeeded} ${votesNeeded === 1 ? "voto" : "votos"} para decidir (o que lo apruebe un admin).`, `${votesNeeded} more ${votesNeeded === 1 ? "vote" : "votes"} to decide (or an admin approves it).`, `${votesNeeded === 1 ? "Falta" : "Faltan"} ${votesNeeded} ${votesNeeded === 1 ? "voto" : "votos"} para decidir (ou que o aprobe un admin).`)}</p>
            ) : quorumReached && votes.yes === votes.no ? (
              <p className="hint vote-needed">{pick(language, "Hay empate: un voto más desnivela, o lo decide un admin.", "It's a tie: one more vote breaks it, or an admin decides.", "Hai empate: un voto máis desnivela, ou decídeo un admin.")}</p>
            ) : null}
            <div className="vote-buttons">
              <button type="button" className={`btn vote-btn yes${votes.myVote === "yes" ? " is-on" : ""}`} disabled={busy} onClick={() => handleVote("yes")}>
                {pick(language, "Sí", "Yes", "Si")} · {votes.yes}
              </button>
              <button type="button" className={`btn vote-btn no${votes.myVote === "no" ? " is-on" : ""}`} disabled={busy} onClick={() => handleVote("no")}>
                {pick(language, "No", "No", "Non")} · {votes.no}
              </button>
              {isAdmin ? (
                <>
                  <button type="button" className="btn btn-primary vote-btn-admin" disabled={busy} onClick={() => handleStatus("reading")} title={pick(language, "Aprobar y poner en lectura", "Approve and start reading", "Aprobar e poñer en lectura")}>
                    <Icon name="check" /> {pick(language, "Aprobar", "Approve", "Aprobar")}
                  </button>
                  <button type="button" className="btn vote-btn-admin vote-btn-discard" disabled={busy} onClick={() => handleStatus("rejected")} title={pick(language, "Descartar la propuesta", "Decline the proposal", "Descartar a proposta")}>
                    <Icon name="x" /> {pick(language, "Descartar", "Decline", "Descartar")}
                  </button>
                  {reminded ? (
                    <span className="hint vote-reminded">{pick(language, "Aviso enviado a quien faltaba", "Reminder sent to those missing", "Aviso enviado a quen faltaba")}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn vote-btn-admin"
                      disabled={busy}
                      onClick={async () => {
                        try { await remindVoters(book.id); setReminded(true); } catch { /* noop */ }
                      }}
                      title={pick(language, "Recordar a los que no han votado", "Remind those who haven't voted", "Lembrar a quen non votou")}
                    >
                      <Icon name="bell" /> {pick(language, "Recordar", "Remind", "Lembrar")}
                    </button>
                  )}
                </>
              ) : null}
            </div>
            {isAdmin ? (
              <p className="hint vote-admin-note">{pick(language,
                `Como admin puedes desempatar cuando el club no acaba de decidir (ahora ${votes.yes} sí · ${votes.no} no).`,
                `As an admin you can break the tie when the club stalls (currently ${votes.yes} yes · ${votes.no} no).`,
                `Como admin podes desempatar cando o club non acaba de decidir (agora ${votes.yes} si · ${votes.no} non).`)}</p>
            ) : null}
          </section>
        ) : book.status === "rejected" ? (
          <section className="page-section book-vote book-rejected-panel">
            <div className="section-head">
              <h2><Icon name="x" /> {pick(language, "Propuesta descartada", "Proposal declined", "Proposta descartada")}</h2>
            </div>
            <p className="hint">{pick(language, "Descartada. Un admin puede reabrir la votación.", "The club didn't take it forward. An admin can reopen the vote.", "O club non a sacou adiante. Un admin pode reabrir a votación.")}</p>
            {isAdmin ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleStatus("proposed")}>
                <Icon name="refresh" /> {pick(language, "Reabrir votación", "Reopen voting", "Reabrir votación")}
              </button>
            ) : null}
          </section>
        ) : null}

        {meetingArrived && book.status !== "proposed" ? (
          <div className="discuss-banner">
            <span className="discuss-banner-text">
              <Icon name="users" size={15} /> {pick(language, `Toca hablar de «${book.title}» — sin miedo a los spoilers`, `Time to discuss “${book.title}” — spoilers welcome`, `Toca falar de «${book.title}» — sen medo aos spoilers`)}
            </span>
            <button type="button" className="btn btn-primary" onClick={() => document.getElementById("comments-composer")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              {pick(language, "Ir a la conversación", "Go to the conversation", "Ir á conversa")}
            </button>
          </div>
        ) : null}

        {book.status === "reading" || book.status === "finished" ? (
          <MeetingCard
            book={book}
            rsvp={meetingRsvp}
            canManage={isAdder || isAdmin}
            onSetMeeting={handleSetMeeting}
            onRsvp={handleRsvp}
            busy={busy}
          />
        ) : null}

        {/* Seguimiento de lectura por capítulos (oculto si la propuesta fue
            descartada: no hay nada que preparar ni marcar). */}
        {book.status !== "rejected" ? (
        <section id="chapters" className="page-section">
          <div className="section-head">
            <h2><Icon name="timeline" /> {pick(language, "Capítulos", "Chapters", "Capítulos")}</h2>
            {named && lastReadChapterId && !allDone ? (
              <button
                type="button"
                className="book-chip book-chip-link"
                onClick={() => document.getElementById(`ch-${lastReadChapterId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Icon name="timeline" size={12} /> {pick(language, "Continuar", "Continue", "Continuar")}
              </button>
            ) : null}
          </div>

          {named ? (
            <div className="stack">
              {allDone ? (
                <>
                  <p className="chapter-alldone"><Icon name="check" /> {pick(language, "Has leído todos los capítulos.", "You've read every chapter.", "Liches todos os capítulos.")}</p>
                  <details className="chapter-collapsed">
                    <summary>{pick(language, `Ver los ${total} capítulos`, `Show the ${total} chapters`, `Ver os ${total} capítulos`)}</summary>
                    <ChapterTimeline chapters={chapters} busy={busy} activeUserId={activeUser.id} onToggle={handleToggle} onAddNote={handleAddNote} members={clubMembers} noteThreads={noteThreads} lastReadChapterId={lastReadChapterId} numberChapters={book.numberChapters !== false} focusCommentId={focusCommentId} focusNoteId={focusNoteId} spoilersOk={spoilersOk} onReactNote={handleReactNote} onEditNote={handleEditNote} onDeleteNote={handleDeleteNote} onReplyComment={handleReply} onReactComment={handleReact} onEditComment={handleEditComment} onDeleteComment={handleDeleteComment} onCommentOnNote={handleCommentOnNote} />
                  </details>
                </>
              ) : (
                <>
                  <ChapterTimeline chapters={chapters} busy={busy} activeUserId={activeUser.id} onToggle={handleToggle} onAddNote={handleAddNote} members={clubMembers} noteThreads={noteThreads} lastReadChapterId={lastReadChapterId} numberChapters={book.numberChapters !== false} focusCommentId={focusCommentId} focusNoteId={focusNoteId} spoilersOk={spoilersOk} onReactNote={handleReactNote} onEditNote={handleEditNote} onDeleteNote={handleDeleteNote} onReplyComment={handleReply} onReactComment={handleReact} onEditComment={handleEditComment} onDeleteComment={handleDeleteComment} onCommentOnNote={handleCommentOnNote} />
                  <button
                    type="button"
                    className="btn chapter-mark-all"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: pick(language, "¿Marcar el libro entero como leído?", "Mark the whole book as read?", "Marcar o libro enteiro como lido?"),
                        confirmLabel: pick(language, "Sí, todo leído", "Yes, all read", "Si, todo lido")
                      });
                      if (ok) handleCompleteAll(true);
                    }}
                  >
                    <Icon name="check" /> {pick(language, "Marcar todo como leído", "Mark all as read", "Marcar todo como lido")}
                  </button>
                </>
              )}
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
                <Icon name="check" /> {parsedPreview.length === 0
                  ? pick(language, "Crear capítulos", "Create chapters", "Crear capítulos")
                  : pick(language, `Crear ${parsedPreview.length} capítulos`, `Create ${parsedPreview.length} chapters`, `Crear ${parsedPreview.length} capítulos`)}
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
            <p className="hint">{pick(language, "Aún no hay capítulos definidos.", "Whoever added the book hasn't set the chapters yet.", "Quen engadiu o libro aínda non definiu os capítulos.")}</p>
          )}

          {/* Valoración: solo cuando has marcado TODOS los capítulos */}
          {allDone ? (
            <div className="book-rating-block">
              <p className="book-finish-cheer">
                🎉 {pick(language, `Terminaste «${book.title}» con el club. Gracias por llegar hasta el final.`, `You finished "${book.title}" with the club. Thanks for reaching the end.`, `Remataches «${book.title}» co club. Grazas por chegar ata o final.`)}
              </p>
              <p className="chapter-finish-title">{pick(language, "Si te apetece, déjale una valoración", "If you feel like it, leave a rating", "Se che apetece, déixalle unha valoración")}</p>
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
                    <Icon name="star" size={18} />
                  </button>
                ))}
              </div>
              <textarea
                className="book-review-input"
                rows={2}
                value={reviewInput}
                onChange={(event) => setReviewInput(event.target.value)}
                placeholder={pick(language, "Reseña (opcional). Se ve cuando todos terminen.", "Review (optional). Shown when everyone finishes.", "Reseña (opcional).")}
              />
              <button type="button" className="btn" disabled={busy} onClick={handleFinish}>
                {pick(language, "Guardar reseña", "Save review", "Gardar reseña")}
              </button>
            </div>
          ) : named ? (
            <p className="hint chapter-rating-hint">{pick(language, "La valoración se abre al marcar todos los capítulos.", "Rating appears once you've checked every chapter.", "A valoración aparece cando marcas todos os capítulos.")}</p>
          ) : null}
        </section>
        ) : null}

        {/* Recursos: enlaces que el club ha aportado, juntos (antes se perdían en el scroll). */}
        {!isProposalPhase && resources.length > 0 ? (
          <section className="page-section book-resources">
            <details>
              <summary className="book-resources-summary">
                <Icon name="link" size={13} /> {pick(language, `Recursos compartidos (${resources.length})`, `Shared resources (${resources.length})`, `Recursos compartidos (${resources.length})`)}
              </summary>
              <ul className="book-resources-list">
                {resources.map((r, i) => (
                  <li key={`${r.url}-${i}`}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="book-resource-link">
                      <Icon name="link" size={12} /> <span className="book-resource-host">{r.host}</span>
                    </a>
                    <span className="book-resource-by">· {r.alias}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        ) : null}

        {/* Discusión general: SOLO sobre el libro entero. Lo de cada capítulo se debate
            en sus notas, arriba. */}
        <section className="page-section community-secondary">
          <div className="section-head">
            <h2><Icon name="comment" /> {isProposalPhase
              ? pick(language, "Discusión de la propuesta", "Proposal discussion", "Discusión da proposta")
              : pick(language, "Conversación del club", "Club conversation", "Conversa do club")}</h2>
          </div>
          {isProposalPhase ? (
            <p className="hint book-convo-hint">{pick(language, "Del libro entero. Para un capítulo, usa sus notas (arriba).", "This is about the whole book. To discuss a chapter, use its notes above.", "Aquí fálase do libro enteiro. Para comentar un capítulo, usa as súas notas arriba.")}</p>
          ) : null}
          <p className="hint">{isProposalPhase
            ? pick(language, "¿Lo leemos? Comentad por qué sí o por qué no antes de votar.", "Shall we read it? Discuss the pros and cons before voting.", "Lémolo? Comentade os prós e contras antes de votar.")
            : pick(language, "Del libro entero. Para un capítulo, usa sus notas (arriba). Sin spoilers 👀", "Thoughts about the whole book. To discuss a chapter, comment on its notes (above). No spoilers 👀", "Ideas sobre todo o libro. Para debater un capítulo, comenta nas súas notas (arriba). Sen spoilers 👀")}</p>

          {/* Archivo plegado de la propuesta: la discusión de "¿lo leemos?" queda guardada
              pero fuera de en medio una vez el libro sale de propuesto. */}
          {!isProposalPhase && proposalComments.length > 0 ? (
            <details className="proposal-archive">
              <summary>{pick(language, `Cómo se propuso · ${proposalComments.length}`, `How it was proposed · ${proposalComments.length}`, `Como se propuxo · ${proposalComments.length}`)}</summary>
              <NoteThread
                comments={proposalComments}
                members={clubMembers}
                activeUserId={activeUser.id}
                isAdmin={isAdmin}
                onReply={handleReply}
                onReact={handleReact}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
              />
            </details>
          ) : null}

          {(
            <form
              id="comments-composer"
              className="book-comment-form"
              onSubmit={(event) => {
                event.preventDefault();
                const clean = commentText.trim();
                if (!clean) return;
                setCommentText("");
                void handleAddComment(clean);
              }}
            >
              <MentionTextarea
                value={commentText}
                onChange={setCommentText}
                members={clubMembers}
                rows={2}
                placeholder={isProposalPhase
                  ? pick(language, "¿Te apetece este? Deja un comentario (opcional, @ menciona)", "Fancy this one? Drop a comment (optional, @ to mention)", "Apetéceche este? Deixa un comentario (opcional, @ menciona)")
                  : book.status === "finished"
                    ? pick(language, "Tus impresiones ahora que lo terminasteis... (@ menciona)", "Your final thoughts now that you finished it... (@ to mention)", "As túas impresións agora que o rematastes... (@ menciona)")
                    : pick(language, "Una idea sobre el libro... (@ menciona)", "A thought about the book... (@ to mention)", "Unha idea sobre o libro... (@ menciona)")}
              />
              <div className="book-comment-foot">
                <span />
                <button type="submit" className="btn btn-primary" disabled={busy || !commentText.trim()}>
                  {pick(language, "Comentar", "Comment", "Comentar")}
                </button>
              </div>
            </form>
          )}
          {(isProposalPhase ? proposalComments : clubComments).length === 0 ? (
            <p className="hint">{isProposalPhase
              ? pick(language, "Sin comentarios. Abre tú el debate.", "No comments yet. Open the conversation about the proposal.", "Aínda non hai comentarios. Abre ti o debate sobre a proposta.")
              : pick(language, "Sin comentarios todavía.", "No club comments about the book yet.", "Aínda non hai comentarios do club sobre o libro.")}</p>
          ) : (
            <NoteThread
              comments={isProposalPhase ? proposalComments : clubComments}
              members={clubMembers}
              activeUserId={activeUser.id}
              isAdmin={isAdmin}
              onReply={handleReply}
              onReact={handleReact}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              onPin={handlePinComment}
            />
          )}
        </section>

        {/* La lista completa de lectores vive ahora en ReadersModal, abierto desde la
            fila discreta de avatares bajo el título. */}
      </div>
    </main>
  );
};
