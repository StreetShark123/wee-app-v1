import { useState } from "react";
import type { BookChapter } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Linkify } from "./Linkify";

interface ChapterTimelineProps {
  chapters: BookChapter[];
  busy: boolean;
  onToggle: (chapterId: string, done: boolean) => void;
  onAddNote: (chapterId: string, text: string, kind: "note" | "reference", imageUrl?: string) => Promise<void>;
}

export const ChapterTimeline = ({ chapters, busy, onToggle, onAddNote }: ChapterTimelineProps) => {
  const { language } = useI18n();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteImage, setNoteImage] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "reference">("note");
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
      {chapters.map((chapter) => (
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

            {/* Anotaciones: solo visibles tras leer el capítulo (anti-spoiler). */}
            {!chapter.doneByMe ? (
              chapter.notes.length > 0 ? (
                <p className="chapter-notes-locked">
                  <Icon name="eyeOff" size={12} /> {pick(language, `${chapter.notes.length} nota(s) — léelo para verlas`, `${chapter.notes.length} note(s) — read it to see them`, `${chapter.notes.length} nota(s) — leo para velas`)}
                </p>
              ) : null
            ) : (
              <>
                {chapter.notes.length > 0 ? (
                  <ul className="chapter-notes">
                    {chapter.notes.map((note) => (
                      <li key={note.id} className={`chapter-note chapter-note-${note.kind}`}>
                        <div className="chapter-note-head">
                          <span className="chapter-note-kind">
                            {note.kind === "reference"
                              ? pick(language, "Referencia", "Reference", "Referencia")
                              : pick(language, "Nota", "Note", "Nota")}
                          </span>
                          <span className="chapter-note-by">{note.alias}</span>
                        </div>
                        {note.text ? (
                          <p className="chapter-note-text"><Linkify text={note.text} /></p>
                        ) : null}
                        {note.imageUrl ? (
                          <a href={note.imageUrl} target="_blank" rel="noopener noreferrer nofollow" className="chapter-note-image">
                            <img src={note.imageUrl} alt="" loading="lazy" />
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {openFor === chapter.id ? (
              <div className="chapter-note-form">
                <div className="chapter-note-kinds">
                  <button type="button" className={`btn chapter-kind${noteKind === "note" ? " is-on" : ""}`} onClick={() => setNoteKind("note")}>
                    {pick(language, "Nota", "Note", "Nota")}
                  </button>
                  <button type="button" className={`btn chapter-kind${noteKind === "reference" ? " is-on" : ""}`} onClick={() => setNoteKind("reference")}>
                    {pick(language, "Referencia", "Reference", "Referencia")}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder={
                    noteKind === "reference"
                      ? pick(language, "Obra/autor citado + enlace (Wikipedia, etc.)", "Cited work/author + link (Wikipedia, etc.)", "Obra/autor citado + ligazón")
                      : pick(language, "Anotación sobre este capítulo... (puedes pegar enlaces)", "A note about this chapter... (you can paste links)", "Anotación sobre este capítulo...")
                  }
                />
                <label className="chapter-note-image-field">
                  <Icon name="camera" size={13} />
                  <input
                    type="url"
                    value={noteImage}
                    onChange={(event) => setNoteImage(event.target.value)}
                    placeholder={pick(language, "URL de imagen (opcional: un cuadro, un retrato...)", "Image URL (optional: a painting, a portrait...)", "URL de imaxe (opcional)")}
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
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};
