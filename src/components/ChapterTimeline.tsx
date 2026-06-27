import { useState } from "react";
import type { BookChapter, ChapterNote, NoteKind } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";
import { Icon } from "./Icon";
import { Linkify } from "./Linkify";

interface ChapterTimelineProps {
  chapters: BookChapter[];
  busy: boolean;
  activeUserId: string;
  onToggle: (chapterId: string, done: boolean) => void;
  onAddNote: (chapterId: string, text: string, kind: NoteKind, imageUrl?: string) => Promise<void>;
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
const NoteMedia = ({ url }: { url: string }) => {
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
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="note-media note-media-img" title={url}>
        <img src={url} alt="" loading="lazy" />
      </a>
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

const NoteCard = ({ note, language }: { note: ChapterNote; language: AppLanguage }) => {
  const media = mediaUrlsOf(note);
  return (
    <li className={`chapter-note chapter-note-${note.kind}`}>
      <div className="chapter-note-head">
        <span className="chapter-note-kind">{kindLabel(note.kind, language)}</span>
        <span className="chapter-note-by">{note.alias}</span>
      </div>
      {note.text ? <p className="chapter-note-text"><Linkify text={note.text} /></p> : null}
      {media.length > 0 ? (
        <div className="chapter-note-media">
          {media.map((url) => <NoteMedia key={url} url={url} />)}
        </div>
      ) : null}
    </li>
  );
};

export const ChapterTimeline = ({ chapters, busy, activeUserId, onToggle, onAddNote }: ChapterTimelineProps) => {
  const { language } = useI18n();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState("");
  const [noteKind, setNoteKind] = useState<NoteKind>("note");
  const [saving, setSaving] = useState(false);

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
              <button
                type="button"
                className="chapter-head"
                disabled={busy}
                onClick={() => onToggle(chapter.id, !chapter.doneByMe)}
              >
                <span className="chapter-title">{chapter.title}</span>
                <span className="chapter-meta">
                  {chapter.doneByMe ? <span className="chapter-done-tag">{pick(language, "Leído", "Read", "Lido")}</span> : null}
                  {chapter.completedCount > 0 ? (
                    <span className="chapter-count" title={pick(language, "Miembros que lo leyeron", "Members who read it", "Membros que o leron")}>
                      <Icon name="users" size={12} /> {chapter.completedCount}
                    </span>
                  ) : null}
                </span>
              </button>

              {/* Tus propias notas SIEMPRE visibles (puedes anotar mientras lees). */}
              {myNotes.length > 0 ? (
                <ul className="chapter-notes">
                  {myNotes.map((note) => <NoteCard key={note.id} note={note} language={language} />)}
                </ul>
              ) : null}

              {/* Las notas de OTROS solo tras leer el capítulo (anti-spoiler). */}
              {chapter.doneByMe ? (
                otherNotes.length > 0 ? (
                  <ul className="chapter-notes">
                    {otherNotes.map((note) => <NoteCard key={note.id} note={note} language={language} />)}
                  </ul>
                ) : null
              ) : otherNotes.length > 0 ? (
                <p className="chapter-notes-locked">
                  <Icon name="eyeOff" size={12} /> {pick(language, `${otherNotes.length} nota(s) de otros — léelo para verlas`, `${otherNotes.length} note(s) from others — read it to see them`, `${otherNotes.length} nota(s) doutros — leo para velas`)}
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
                          : pick(language, "Anotación sobre este capítulo... (pega enlaces: vídeo, imagen, web)", "A note about this chapter... (paste links: video, image, web)", "Anotación sobre este capítulo... (pega ligazóns)")
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
