import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BookChapter, ChapterNote, NoteKind } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";
import { timeAgo } from "../lib/timeAgo";
import { Icon } from "./Icon";
import { Linkify } from "./Linkify";
import { ReactionPicker } from "./ReactionPicker";

interface ChapterTimelineProps {
  chapters: BookChapter[];
  busy: boolean;
  activeUserId: string;
  onToggle: (chapterId: string, done: boolean) => void;
  onAddNote: (chapterId: string, text: string, kind: NoteKind, imageUrl?: string) => Promise<void>;
  onCommentNote?: (chapterId: string, note: ChapterNote) => void;
  noteThreadById?: Map<string, { rootId: string; count: number }>;
  onViewNoteThread?: (rootId: string) => void;
  onReactNote?: (noteId: string, emoji: string) => void;
  onEditNote?: (noteId: string, text: string) => Promise<void>;
  onDeleteNote?: (noteId: string) => void;
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

// Visor de imagen a tamaño real, con enlace al original.
const ImageLightbox = ({ url, onClose, language }: { url: string; onClose: () => void; language: AppLanguage }) => {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onEsc); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="image-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <img className="image-lightbox-img" src={url} alt="" />
        <div className="image-lightbox-actions">
          <a className="btn" href={url} target="_blank" rel="noopener noreferrer nofollow">
            <Icon name="link" size={13} /> {pick(language, "Visitar enlace original", "Visit original link", "Visitar ligazón orixinal")}
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {pick(language, "Cerrar", "Close", "Pechar")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
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
        {lightboxOpen ? <ImageLightbox url={url} onClose={() => setLightboxOpen(false)} language={language} /> : null}
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
  onComment,
  threadCount,
  onViewThread,
  onReact,
  onEdit,
  onDelete
}: {
  note: ChapterNote;
  language: AppLanguage;
  mine?: boolean;
  onComment?: () => void;
  threadCount?: number;
  onViewThread?: () => void;
  onReact?: (emoji: string) => void;
  onEdit?: (text: string) => Promise<void>;
  onDelete?: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(note.text);
  const [savingEdit, setSavingEdit] = useState(false);
  const media = mediaUrlsOf(note);
  const hasThread = !!threadCount && threadCount > 0;
  const reactions = note.reactions ?? [];
  const canManage = mine && (onEdit || onDelete);
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
  return (
    <li className={`chapter-note chapter-note-${note.kind}`}>
      <div className="chapter-note-head">
        <span className="chapter-note-by">
          {note.alias}
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
      {onReact || reactions.length > 0 ? (
        <div className="note-reactions comment-actions">
          {reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={`reaction-chip reaction-pop${r.mine ? " is-mine" : ""}`}
              onClick={() => onReact?.(r.emoji)}
              aria-pressed={r.mine}
              title={r.mine ? pick(language, "Quitar tu reacción", "Remove your reaction", "Quitar a túa reacción") : pick(language, "Reaccionar", "React", "Reaccionar")}
            >
              <span aria-hidden="true">{r.emoji}</span> <span className="reaction-count">{r.count}</span>
            </button>
          ))}
          {onReact ? <ReactionPicker onPick={onReact} /> : null}
        </div>
      ) : null}

      {(onComment || onViewThread || canManage) && !editing ? (
        <div className="chapter-note-threadbar">
          {hasThread && onViewThread ? (
            <button type="button" className="chapter-note-action chapter-note-action-view" onClick={onViewThread}>
              <Icon name="comment" size={11} /> {pick(language, `Ver hilo · ${threadCount}`, `View thread · ${threadCount}`, `Ver fío · ${threadCount}`)}
            </button>
          ) : null}
          {onComment ? (
            <button type="button" className="chapter-note-action" onClick={onComment}>
              <Icon name="plus" size={11} /> {hasThread ? pick(language, "Nuevo hilo", "New thread", "Novo fío") : pick(language, "Crear hilo", "Start thread", "Crear fío")}
            </button>
          ) : null}
          {mine && onEdit ? (
            <button type="button" className="chapter-note-action" onClick={() => { setEditText(note.text); setEditing(true); }}>
              <Icon name="pencil" size={11} /> {pick(language, "Editar", "Edit", "Editar")}
            </button>
          ) : null}
          {mine && onDelete ? (
            <button type="button" className="chapter-note-action chapter-note-action-del" onClick={onDelete}>
              <Icon name="trash" size={11} /> {pick(language, "Borrar", "Delete", "Borrar")}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

export const ChapterTimeline = ({ chapters, busy, activeUserId, onToggle, onAddNote, onCommentNote, noteThreadById, onViewNoteThread, onReactNote, onEditNote, onDeleteNote }: ChapterTimelineProps) => {
  const { language } = useI18n();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState("");
  const [noteKind, setNoteKind] = useState<NoteKind>("note");
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (chapterId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });

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

  return (
    <ol className="chapter-timeline">
      {chapters.map((chapter) => {
        const myNotes = chapter.notes.filter((n) => n.userId === activeUserId);
        const otherNotes = chapter.notes.filter((n) => n.userId !== activeUserId);
        const visibleNotes = chapter.doneByMe ? [...myNotes, ...otherNotes] : myNotes;
        const lockedCount = chapter.doneByMe ? 0 : otherNotes.length;
        const isCollapsed = collapsed.has(chapter.id);
        return (
          <li key={chapter.id} className={`chapter-node${chapter.doneByMe ? " is-done" : ""}`}>
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
                <span className="chapter-title">{chapter.title}</span>
                <span className="chapter-meta">
                  {chapter.doneByMe ? <span className="chapter-done-tag">{pick(language, "Leído", "Read", "Lido")}</span> : null}
                  {chapter.completedCount > 0 ? (
                    <span className="chapter-count" title={pick(language, "Miembros que lo leyeron", "Members who read it", "Membros que o leron")}>
                      <Icon name="users" size={12} /> {chapter.completedCount}
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Notas colapsables (tus notas siempre; las de otros tras leer). */}
              {visibleNotes.length > 0 ? (
                <div className="chapter-notes-block">
                  <button type="button" className="chapter-notes-toggle" onClick={() => toggleCollapsed(chapter.id)} aria-expanded={!isCollapsed}>
                    <span className={`chapter-notes-caret${isCollapsed ? " is-collapsed" : ""}`} aria-hidden="true">▾</span>
                    {pick(language, `Notas (${visibleNotes.length})`, `Notes (${visibleNotes.length})`, `Notas (${visibleNotes.length})`)}
                  </button>
                  {!isCollapsed ? (
                    <ul className="chapter-notes">
                      {visibleNotes.map((note) => {
                        const thread = noteThreadById?.get(note.id);
                        return (
                          <NoteCard
                            key={note.id}
                            note={note}
                            language={language}
                            mine={note.userId === activeUserId}
                            onComment={onCommentNote ? () => onCommentNote(chapter.id, note) : undefined}
                            threadCount={thread?.count}
                            onViewThread={thread && onViewNoteThread ? () => onViewNoteThread(thread.rootId) : undefined}
                            onReact={onReactNote ? (emoji) => onReactNote(note.id, emoji) : undefined}
                            onEdit={onEditNote ? (text) => onEditNote(note.id, text) : undefined}
                            onDelete={onDeleteNote ? () => onDeleteNote(note.id) : undefined}
                          />
                        );
                      })}
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
