import { useEffect, useState } from "react";
import type { BookChapter, BookComment, ChapterNote, ClubMemberLite, NoteKind } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { CONTENT_IMG_MAX_PX, imageFileToDataUrl } from "../lib/imageCompress";
import type { AppLanguage } from "../lib/types";
import { timeAgo } from "../lib/timeAgo";
import { Icon } from "./Icon";
import { ImageLightbox } from "./ImageLightbox";
import { Linkify } from "./Linkify";
import { MentionTextarea } from "./MentionTextarea";
import { NoteThread } from "./CommentThread";
import { UserBadge, UserDot, styleFor } from "./UserBadge";
import { VoteControl } from "./VoteControl";

interface ChapterTimelineProps {
  chapters: BookChapter[];
  busy: boolean;
  activeUserId: string;
  members: ClubMemberLite[];
  noteThreads: Map<string, BookComment[]>;
  lastReadChapterId?: string | null;
  numberChapters?: boolean;
  focusCommentId?: string | null;
  focusNoteId?: string | null;
  spoilersOk?: boolean;
  onToggle: (chapterId: string, done: boolean) => void;
  onAddNote: (chapterId: string, text: string, kind: NoteKind, imageUrl?: string) => Promise<void>;
  onReactNote?: (noteId: string, emoji: string) => void;
  onEditNote?: (noteId: string, text: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => void;
  onReplyComment: (parentId: string, text: string) => Promise<void>;
  onReactComment: (commentId: string, emoji: string) => void;
  onEditComment: (commentId: string, text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => void;
  onCommentOnNote: (noteId: string, text: string) => Promise<void>;
}

const YT_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i;
const IMG_RE = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;
const URL_RE = /https?:\/\/[^\s)]+/gi;
const isImageUrl = (url: string): boolean => IMG_RE.test(url) || url.startsWith("data:image/");

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Detecta el tipo de un enlace para renderizarlo de forma adecuada.
const NoteMedia = ({ url, language }: { url: string; language: AppLanguage }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const yt = url.match(YT_RE);
  if (yt) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="note-media note-media-yt" title={url}>
        <img src={`https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`} alt="" loading="lazy" />
        <span className="note-media-play" aria-hidden="true">▶</span>
        <span className="note-media-tag">YouTube</span>
      </a>
    );
  }
  if (isImageUrl(url)) {
    return (
      <>
        <button
          type="button"
          className="note-media note-media-img"
          onClick={() => setLightboxOpen(true)}
          title={pick(language, "Ver a tamaño real", "View full size", "Ver a tamaño real")}
        >
          <img src={url} alt="" loading="lazy" />
        </button>
        {lightboxOpen ? <ImageLightbox url={url} onClose={() => setLightboxOpen(false)} /> : null}
      </>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="note-media note-media-link" title={url}>
      <Icon name="link" size={13} /> {hostOf(url)}
    </a>
  );
};

// Reúne los enlaces "con media" de una nota: el campo dedicado + los que el
// usuario haya pegado en el texto (YouTube/imagen). Sin duplicados.
const mediaUrlsOf = (note: ChapterNote): string[] => {
  const fromText = (note.text.match(URL_RE) ?? []).filter((u) => YT_RE.test(u) || IMG_RE.test(u));
  const all = [note.imageUrl, ...fromText].filter((u): u is string => !!u);
  return Array.from(new Set(all));
};

const kindLabel = (kind: NoteKind, language: AppLanguage): string =>
  kind === "reference"
    ? pick(language, "Referencia", "Reference", "Referencia")
    : kind === "prompt"
      ? pick(language, "Pregunta de debate", "Discussion prompt", "Pregunta de debate")
      : pick(language, "Nota", "Note", "Nota");

const NoteCard = ({
  note,
  language,
  mine,
  activeUserId,
  members,
  thread,
  defaultThreadOpen,
  onReact,
  onEdit,
  onDelete,
  onReplyComment,
  onReactComment,
  onEditComment,
  onDeleteComment,
  onCommentOnNote
}: {
  note: ChapterNote;
  language: AppLanguage;
  mine?: boolean;
  activeUserId: string;
  members: ClubMemberLite[];
  thread: BookComment[];
  defaultThreadOpen?: boolean;
  onReact?: (emoji: string) => void;
  onEdit?: (text: string) => Promise<void>;
  onDelete?: () => void;
  onReplyComment: (parentId: string, text: string) => Promise<void>;
  onReactComment: (commentId: string, emoji: string) => void;
  onEditComment: (commentId: string, text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => void;
  onCommentOnNote: (text: string) => Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(note.text);
  const [savingEdit, setSavingEdit] = useState(false);
  // Los hilos arrancan colapsados por definición; se abren al clicar el toggle.
  const [threadOpen, setThreadOpen] = useState(() => Boolean(defaultThreadOpen) && thread.length > 0);
  const [noteCommentText, setNoteCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const media = mediaUrlsOf(note);
  const reactions = note.reactions ?? [];
  const threadCount = thread.length;

  const submitEdit = async () => {
    const clean = editText.trim();
    if (!clean || !onEdit || savingEdit) return;
    setSavingEdit(true);
    try {
      await onEdit(clean);
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };
  const submitNoteComment = async () => {
    const clean = noteCommentText.trim();
    if (!clean || sendingComment) return;
    setSendingComment(true);
    try {
      await onCommentOnNote(clean);
      setNoteCommentText("");
      setComposerOpen(false);
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <li id={`note-${note.id}`} className={`chapter-note chapter-note-${note.kind}`}>
      <div className="chapter-note-head">
        <span className="chapter-note-by">
          <UserBadge alias={note.alias} {...styleFor(members, note.userId)} withAvatar />
          <span className="chapter-note-time"> · {timeAgo(note.createdAt, language)}</span>
          {note.editedAt ? <span className="chapter-note-edited"> · {pick(language, "editado", "edited", "editado")}</span> : null}
        </span>
        <span className="chapter-note-kind">{kindLabel(note.kind, language)}</span>
      </div>
      {editing ? (
        <div className="chapter-note-edit">
          <textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
          <div className="chapter-note-actions">
            <button type="button" className="btn" onClick={() => { setEditing(false); setEditText(note.text); }} disabled={savingEdit}>{pick(language, "Cancelar", "Cancel", "Cancelar")}</button>
            <button type="button" className="btn btn-primary" onClick={submitEdit} disabled={savingEdit || !editText.trim()}>{pick(language, "Guardar", "Save", "Gardar")}</button>
          </div>
        </div>
      ) : note.text ? <p className="chapter-note-text"><Linkify text={note.text} /></p> : null}
      {media.length > 0 ? (
        <div className="chapter-note-media">
          {media.map((url) => <NoteMedia key={url} url={url} language={language} />)}
        </div>
      ) : null}

      {!editing ? (
        <div className="note-actionbar">
          {onReact ? <VoteControl reactions={reactions} onVote={onReact} /> : null}
          <button type="button" className={`note-thread-toggle${threadOpen ? " is-open" : ""}`} aria-expanded={threadOpen} onClick={() => setThreadOpen((v) => !v)}>
            <Icon name="comment" size={12} /> {threadCount > 0
              ? `${threadCount} ${threadCount === 1 ? pick(language, "comentario", "comment", "comentario") : pick(language, "comentarios", "comments", "comentarios")}`
              : note.kind === "prompt"
                ? pick(language, "Responder", "Reply", "Responder")
                : pick(language, "Comentar", "Comment", "Comentar")}
          </button>
          {/* Editar/Borrar como iconos a la derecha: la fila cabe en móvil. */}
          <span className="comment-own-acts">
            {mine && onEdit ? (
              <button type="button" className="note-mini-action comment-act-icon" onClick={() => { setEditText(note.text); setEditing(true); }} aria-label={pick(language, "Editar", "Edit", "Editar")} title={pick(language, "Editar", "Edit", "Editar")}>
                <Icon name="pencil" size={13} />
              </button>
            ) : null}
            {mine && onDelete ? (
              <button type="button" className="note-mini-action note-mini-action-del comment-act-icon" onClick={onDelete} aria-label={pick(language, "Borrar", "Delete", "Borrar")} title={pick(language, "Borrar", "Delete", "Borrar")}>
                <Icon name="trash" size={13} />
              </button>
            ) : null}
          </span>
        </div>
      ) : null}

      {threadOpen && !editing ? (
        <div className="note-thread-wrap">
          {threadCount > 0 ? (
            <NoteThread comments={thread} members={members} activeUserId={activeUserId} onReply={onReplyComment} onReact={onReactComment} onEdit={onEditComment} onDelete={onDeleteComment} />
          ) : null}
          {composerOpen || threadCount === 0 ? (
            <div className="note-comment-composer">
              <MentionTextarea
                value={noteCommentText}
                onChange={setNoteCommentText}
                members={members}
                rows={2}
                placeholder={pick(language, "Comenta esta nota... (@ menciona)", "Comment on this note... (@ to mention)", "Comenta esta nota... (@ menciona)")}
              />
              <div className="chapter-note-actions">
                {threadCount > 0 ? (
                  <button type="button" className="btn" onClick={() => { setComposerOpen(false); setNoteCommentText(""); }}>
                    {pick(language, "Cancelar", "Cancel", "Cancelar")}
                  </button>
                ) : null}
                <button type="button" className="btn btn-primary btn-tiny" onClick={submitNoteComment} disabled={sendingComment || !noteCommentText.trim()}>
                  {pick(language, "Comentar", "Comment", "Comentar")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="note-thread-toggle note-add-comment" onClick={() => setComposerOpen(true)}>
              <Icon name="plus" size={12} /> {pick(language, "Comentar", "Comment", "Comentar")}
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
};

export const ChapterTimeline = ({ chapters, busy, activeUserId, members, noteThreads, lastReadChapterId, numberChapters, focusCommentId, focusNoteId: focusNoteIdProp, spoilersOk = false, onToggle, onAddNote, onReactNote, onEditNote, onDeleteNote, onReplyComment, onReactComment, onEditComment, onDeleteComment, onCommentOnNote }: ChapterTimelineProps) => {
  const { language } = useI18n();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState("");
  const [noteFile, setNoteFile] = useState("");   // imagen subida del dispositivo (data URL)
  const [noteKind, setNoteKind] = useState<NoteKind>("note");
  const [saving, setSaving] = useState(false);
  // Por defecto solo se despliegan las notas del ÚLTIMO capítulo leído; el resto van
  // colapsadas. El usuario puede abrir/cerrar cada una (override).
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});

  const toggleNotesOpen = (chapterId: string, defaultOpen: boolean) =>
    setOpenOverride((prev) => ({ ...prev, [chapterId]: !(prev[chapterId] ?? defaultOpen) }));

  const resetForm = () => {
    setNoteText("");
    setNoteImage("");
    setNoteFile("");
    setNoteKind("note");
    setOpenFor(null);
  };

  // Borrador local por capítulo: si la red falla o se cierra la app a mitad de
  // una nota, el texto no se pierde. Se limpia al publicar.
  const draftKey = (chapterId: string) => `wee:draft:note:${chapterId}`;
  const openComposer = (chapterId: string) => {
    setNoteImage("");
    setNoteFile("");
    setNoteKind("note");
    let draft = "";
    try {
      draft = localStorage.getItem(draftKey(chapterId)) ?? "";
    } catch {
      // storage bloqueado: composer vacío
    }
    setNoteText(draft);
    setOpenFor(chapterId);
  };
  useEffect(() => {
    if (!openFor) return;
    try {
      if (noteText.trim()) localStorage.setItem(draftKey(openFor), noteText);
      else localStorage.removeItem(draftKey(openFor));
    } catch {
      // storage lleno/bloqueado: el borrador simplemente no persiste
    }
  }, [noteText, openFor]);

  const submitNote = async (chapterId: string) => {
    const cleanText = noteText.trim();
    // La imagen subida (data URL) tiene prioridad sobre el enlace escrito.
    const cleanImage = noteFile || noteImage.trim();
    if ((!cleanText && !cleanImage) || saving) return;
    setSaving(true);
    try {
      await onAddNote(chapterId, cleanText, noteKind, cleanImage || undefined);
      try {
        localStorage.removeItem(draftKey(chapterId));
      } catch {
        // noop
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  // Nota objetivo: llega directa por deep-link del feed (#note-<id>) o se deduce del
  // comentario (#c-<id>) localizando la nota cuyo hilo lo contiene. En ambos casos
  // sirve para auto-abrir su capítulo + hilo y poder hacer scroll hasta ella.
  let focusNoteId: string | null = focusNoteIdProp ?? null;
  if (!focusNoteId && focusCommentId) {
    for (const [noteId, thread] of noteThreads) {
      if (thread.some((c) => c.id === focusCommentId)) {
        focusNoteId = noteId;
        break;
      }
    }
  }

  return (
    <>
      <p className="chapter-timeline-help">
        {pick(
          language,
          "Pulsa el círculo de la izquierda cuando termines cada capítulo. Puedes volver a pulsarlo para desmarcarlo.",
          "Tap the circle on the left when you finish each chapter. Tap it again to unmark it.",
          "Preme o círculo da esquerda cando remates cada capítulo. Prémeo de novo para desmarcalo."
        )}
      </p>
      <ol className="chapter-timeline">
      {chapters.map((chapter, chapterIdx) => {
        const isNamed = !/^cap[íi]tulo\s*\d+\s*$/i.test(chapter.title.trim());
        // Si el título YA empieza por un número (p.ej. "1 La ley antojada"), no
        // anteponer otro → evita el "1. 1 La ley…" que confunde al marcar.
        const startsWithNumber = /^\s*\d+[.)\s]/.test(chapter.title);
        const displayTitle = numberChapters && isNamed && !startsWithNumber ? `${chapterIdx + 1}. ${chapter.title}` : chapter.title;
        const myNotes = chapter.notes.filter((n) => n.userId === activeUserId);
        const otherNotes = chapter.notes.filter((n) => n.userId !== activeUserId);
        const chapterHasFocus = !!focusNoteId && chapter.notes.some((n) => n.id === focusNoteId);
        // spoilersOk (llegó la cita / libro terminado): se levanta el anti-spoiler.
        let visibleNotes = chapter.doneByMe || spoilersOk ? [...myNotes, ...otherNotes] : myNotes;
        // Revela la nota objetivo de la notificación aunque sea de otro en capítulo sin leer:
        // el usuario ya forma parte de esa conversación.
        let revealedLocked = false;
        if (chapterHasFocus && !visibleNotes.some((n) => n.id === focusNoteId)) {
          const focusNote = otherNotes.find((n) => n.id === focusNoteId);
          if (focusNote) {
            visibleNotes = [...visibleNotes, focusNote];
            revealedLocked = true;
          }
        }
        const lockedCount = chapter.doneByMe || spoilersOk ? 0 : otherNotes.length - (revealedLocked ? 1 : 0);
        const defaultOpen = chapter.id === lastReadChapterId || chapterHasFocus;
        const notesOpen = openOverride[chapter.id] ?? defaultOpen;
        return (
          <li key={chapter.id} id={`ch-${chapter.id}`} className={`chapter-node${chapter.doneByMe ? " is-done" : ""}`}>
            <button
              type="button"
              className="chapter-check"
              disabled={busy}
              aria-pressed={chapter.doneByMe}
              aria-label={pick(language, `Marcar "${chapter.title}" como leído`, `Mark "${chapter.title}" as read`, `Marcar "${chapter.title}" como lido`)}
              onClick={() => onToggle(chapter.id, !chapter.doneByMe)}
            >
              <Icon name="check" size={16} />
            </button>

            <div className="chapter-body">
              {/* Solo el check marca leído (no toda la fila → sin toggles accidentales). */}
              <div className="chapter-head">
                <span className="chapter-title">{displayTitle}</span>
                <span className="chapter-meta">
                  {chapter.doneByMe ? <span className="chapter-done-tag">{pick(language, "Leído", "Read", "Lido")}</span> : null}
                  {(chapter.readers ?? []).length > 0 ? (
                    <span className="chapter-readers" title={pick(language, `Lo han leído ${chapter.completedCount}`, `${chapter.completedCount} have read it`, `Léronno ${chapter.completedCount}`)}>
                      {(chapter.readers ?? []).slice(0, 5).map((r) => <UserDot key={r.id} alias={r.alias} {...styleFor(members, r.id)} />)}
                      {(chapter.readers ?? []).length > 5 ? <span className="chapter-readers-more">+{(chapter.readers ?? []).length - 5}</span> : null}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Barra de notas: chip (icono + nº, despliega) + botón "+" para añadir, en una fila. */}
              <div className="chapter-notes-bar">
                {visibleNotes.length > 0 ? (
                  <button type="button" className="chapter-notes-chip" onClick={() => toggleNotesOpen(chapter.id, defaultOpen)} aria-expanded={notesOpen}>
                    <Icon name="comment" size={13} /> <span className="chapter-notes-count">{visibleNotes.length}</span>
                    <span className={`chapter-notes-caret${notesOpen ? "" : " is-collapsed"}`} aria-hidden="true">▾</span>
                  </button>
                ) : null}
                {openFor !== chapter.id ? (
                  <button
                    type="button"
                    className="chapter-note-add-btn"
                    onClick={() => openComposer(chapter.id)}
                    aria-label={pick(language, "Añadir nota", "Add note", "Engadir nota")}
                    title={pick(language, "Añadir nota", "Add note", "Engadir nota")}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                ) : null}
              </div>
              {visibleNotes.length > 0 && notesOpen ? (
                <ul className="chapter-notes">
                  {visibleNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      language={language}
                      mine={note.userId === activeUserId}
                      activeUserId={activeUserId}
                      members={members}
                      thread={noteThreads.get(note.id) ?? []}
                      defaultThreadOpen={defaultOpen || note.id === focusNoteId}
                      onReact={onReactNote ? (emoji) => onReactNote(note.id, emoji) : undefined}
                      onEdit={onEditNote ? (text) => onEditNote(note.id, text) : undefined}
                      onDelete={onDeleteNote ? () => onDeleteNote(note.id) : undefined}
                      onReplyComment={onReplyComment}
                      onReactComment={onReactComment}
                      onEditComment={onEditComment}
                      onDeleteComment={onDeleteComment}
                      onCommentOnNote={(text) => onCommentOnNote(note.id, text)}
                    />
                  ))}
                </ul>
              ) : null}

              {/* Las notas de OTROS solo tras leer el capítulo (anti-spoiler). */}
              {lockedCount > 0 ? (
                <p className="chapter-notes-locked">
                  <Icon name="eyeOff" size={12} /> {pick(language, `${lockedCount} nota(s) de otros — léelo para verlas`, `${lockedCount} note(s) from others — read it to see them`, `${lockedCount} nota(s) doutros — leo para velas`)}
                </p>
              ) : null}

              {/* Composer: disponible siempre, leas o no el capítulo. */}
              {openFor === chapter.id ? (
                <div className="chapter-note-form">
                  <div className="chapter-note-kinds">
                    <button type="button" className={`btn chapter-kind${noteKind === "note" ? " is-on" : ""}`} onClick={() => setNoteKind("note")}>
                      {pick(language, "Nota", "Note", "Nota")}
                    </button>
                    <button type="button" className={`btn chapter-kind${noteKind === "prompt" ? " is-on" : ""}`} onClick={() => setNoteKind("prompt")}>
                      {pick(language, "Pregunta", "Question", "Pregunta")}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder={noteKind === "prompt"
                      ? pick(language, "Tu pregunta para el club...", "Your question for the club...", "A túa pregunta para o club...")
                      : pick(language, "Escribe tu nota...", "Write your note...", "Escribe a túa nota...")}
                  />
                  {noteFile ? (
                    <div className="chapter-note-image-preview">
                      <img src={noteFile} alt="" />
                      <button type="button" className="btn btn-tiny" onClick={() => setNoteFile("")}>{pick(language, "Quitar imagen", "Remove image", "Quitar imaxe")}</button>
                    </div>
                  ) : (
                    <div className="chapter-note-media-row">
                      <input
                        className="chapter-note-link-input"
                        type="url"
                        value={noteImage}
                        onChange={(event) => setNoteImage(event.target.value)}
                        placeholder={pick(language, "Enlace (opcional)", "Link (optional)", "Ligazón (opcional)")}
                      />
                      <label className="btn chapter-note-upload">
                        <Icon name="camera" size={13} /> {pick(language, "Añadir imagen", "Add image", "Engadir imaxe")}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            void imageFileToDataUrl(file, CONTENT_IMG_MAX_PX).then(setNoteFile).catch(() => undefined);
                          }}
                        />
                      </label>
                    </div>
                  )}
                  <div className="chapter-note-actions">
                    <button type="button" className="btn" onClick={resetForm} disabled={saving}>
                      {pick(language, "Cancelar", "Cancel", "Cancelar")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => submitNote(chapter.id)}
                      disabled={saving || (!noteText.trim() && !noteFile && !noteImage.trim())}
                    >
                      {pick(language, "Guardar nota", "Save note", "Gardar nota")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
      </ol>
    </>
  );
};
