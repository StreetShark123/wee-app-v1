import { useState } from "react";
import type { BookChapter, BookComment, ChapterNote, ClubMemberLite, NoteKind } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
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
  if (IMG_RE.test(url)) {
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
    <li className={`chapter-note chapter-note-${note.kind}`}>
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
          {mine && onEdit ? (
            <button type="button" className="note-mini-action" onClick={() => { setEditText(note.text); setEditing(true); }}>
              <Icon name="pencil" size={11} /> {pick(language, "Editar", "Edit", "Editar")}
            </button>
          ) : null}
          {mine && onDelete ? (
            <button type="button" className="note-mini-action note-mini-action-del" onClick={onDelete}>
              <Icon name="trash" size={11} /> {pick(language, "Borrar", "Delete", "Borrar")}
            </button>
          ) : null}
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

export const ChapterTimeline = ({ chapters, busy, activeUserId, members, noteThreads, lastReadChapterId, numberChapters, focusCommentId, onToggle, onAddNote, onReactNote, onEditNote, onDeleteNote, onReplyComment, onReactComment, onEditComment, onDeleteComment, onCommentOnNote }: ChapterTimelineProps) => {
  const { language } = useI18n();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState("");
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
    setNoteKind("note");
    setOpenFor(null);
  };

  const submitNote = async (chapterId: string) => {
    const cleanText = noteText.trim();
    const cleanImage = noteImage.trim();
    if ((!cleanText && !cleanImage) || saving) return;
    setSaving(true);
    try {
      await onAddNote(chapterId, cleanText, noteKind, cleanImage || undefined);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  // Si venimos de una notificación (#c-<id>): localiza la nota cuyo hilo contiene ese
  // comentario, para auto-abrir su capítulo + hilo y poder hacer scroll hasta él.
  let focusNoteId: string | null = null;
  if (focusCommentId) {
    for (const [noteId, thread] of noteThreads) {
      if (thread.some((c) => c.id === focusCommentId)) {
        focusNoteId = noteId;
        break;
      }
    }
  }

  return (
    <ol className="chapter-timeline">
      {chapters.map((chapter, chapterIdx) => {
        const isNamed = !/^cap[íi]tulo\s*\d+\s*$/i.test(chapter.title.trim());
        const displayTitle = numberChapters && isNamed ? `${chapterIdx + 1}. ${chapter.title}` : chapter.title;
        const myNotes = chapter.notes.filter((n) => n.userId === activeUserId);
        const otherNotes = chapter.notes.filter((n) => n.userId !== activeUserId);
        const chapterHasFocus = !!focusNoteId && chapter.notes.some((n) => n.id === focusNoteId);
        let visibleNotes = chapter.doneByMe ? [...myNotes, ...otherNotes] : myNotes;
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
        const lockedCount = chapter.doneByMe ? 0 : otherNotes.length - (revealedLocked ? 1 : 0);
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

              {/* Notas colapsables (tus notas siempre; las de otros tras leer). */}
              {visibleNotes.length > 0 ? (
                <div className="chapter-notes-block">
                  <button type="button" className="chapter-notes-toggle" onClick={() => toggleNotesOpen(chapter.id, defaultOpen)} aria-expanded={notesOpen}>
                    <span className={`chapter-notes-caret${notesOpen ? "" : " is-collapsed"}`} aria-hidden="true">▾</span>
                    {pick(language, `Notas (${visibleNotes.length})`, `Notes (${visibleNotes.length})`, `Notas (${visibleNotes.length})`)}
                  </button>
                  {notesOpen ? (
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
                </div>
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
                    <button type="button" className={`btn chapter-kind${noteKind === "reference" ? " is-on" : ""}`} onClick={() => setNoteKind("reference")}>
                      {pick(language, "Referencia", "Reference", "Referencia")}
                    </button>
                    <button type="button" className={`btn chapter-kind${noteKind === "prompt" ? " is-on" : ""}`} onClick={() => setNoteKind("prompt")}>
                      {pick(language, "Pregunta", "Prompt", "Pregunta")}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder={
                      noteKind === "reference"
                        ? pick(language, "Obra/autor citado + enlace (Wikipedia, etc.)", "Cited work/author + link (Wikipedia, etc.)", "Obra/autor citado + ligazón")
                        : noteKind === "prompt"
                          ? pick(language, "Pregunta para debatir este capítulo...", "A question to discuss this chapter...", "Pregunta para debater este capítulo...")
                          : pick(language, "Nota sobre este capítulo... (pega enlaces: vídeo, imagen, web)", "A note about this chapter... (paste links: video, image, web)", "Nota sobre este capítulo... (pega ligazóns)")
                    }
                  />
                  <label className="chapter-note-image-field">
                    <Icon name="link" size={13} />
                    <input
                      type="url"
                      value={noteImage}
                      onChange={(event) => setNoteImage(event.target.value)}
                      placeholder={pick(language, "Enlace (opcional): vídeo de YouTube, imagen, web...", "Link (optional): YouTube video, image, web...", "Ligazón (opcional): vídeo, imaxe, web...")}
                    />
                  </label>
                  <div className="chapter-note-actions">
                    <button type="button" className="btn" onClick={resetForm} disabled={saving}>
                      {pick(language, "Cancelar", "Cancel", "Cancelar")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => submitNote(chapter.id)}
                      disabled={saving || (!noteText.trim() && !noteImage.trim())}
                    >
                      {pick(language, "Guardar nota", "Save note", "Gardar nota")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn chapter-add-note"
                  onClick={() => {
                    resetForm();
                    setOpenFor(chapter.id);
                  }}
                >
                  <Icon name="plus" size={12} /> {pick(language, "Añadir nota", "Add note", "Engadir nota")}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
