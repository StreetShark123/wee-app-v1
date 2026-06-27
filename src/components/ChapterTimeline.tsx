import { useState } from "react";
import type { BookChapter } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

interface ChapterTimelineProps {
  chapters: BookChapter[];
  busy: boolean;
  onToggle: (chapterId: string, done: boolean) => void;
  onAddNote: (chapterId: string, text: string, kind: "note" | "reference") => Promise<void>;
}

export const ChapterTimeline = ({ chapters, busy, onToggle, onAddNote }: ChapterTimelineProps) => {
  const { language } = useI18n();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "reference">("note");
  const [saving, setSaving] = useState(false);

  const submitNote = async (chapterId: string) => {
    const clean = noteText.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      await onAddNote(chapterId, clean, noteKind);
      setNoteText("");
      setOpenFor(null);
      setNoteKind("note");
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
            aria-label={chapter.title}
            onClick={() => onToggle(chapter.id, !chapter.doneByMe)}
          >
            {chapter.doneByMe ? <Icon name="check" size={14} /> : <span className="chapter-dot" aria-hidden="true" />}
          </button>

          <div className="chapter-body">
            <div className="chapter-head">
              <span className="chapter-title">
                <span className="chapter-num">{chapter.idx + 1}</span> {chapter.title}
              </span>
              {chapter.completedCount > 0 ? (
                <span className="chapter-count" title={pick(language, "Miembros que lo completaron", "Members who finished it", "Membros que o completaron")}>
                  <Icon name="users" size={12} /> {chapter.completedCount}
                </span>
              ) : null}
            </div>

            {chapter.notes.length > 0 ? (
              <ul className="chapter-notes">
                {chapter.notes.map((note) => (
                  <li key={note.id} className={`chapter-note chapter-note-${note.kind}`}>
                    <span className="chapter-note-kind">
                      {note.kind === "reference"
                        ? pick(language, "Ref.", "Ref.", "Ref.")
                        : pick(language, "Nota", "Note", "Nota")}
                    </span>
                    <span className="chapter-note-text">{note.text}</span>
                    <span className="chapter-note-by">{note.alias}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {openFor === chapter.id ? (
              <div className="chapter-note-form">
                <div className="chapter-note-kinds">
                  <button
                    type="button"
                    className={`btn chapter-kind${noteKind === "note" ? " is-on" : ""}`}
                    onClick={() => setNoteKind("note")}
                  >
                    {pick(language, "Nota", "Note", "Nota")}
                  </button>
                  <button
                    type="button"
                    className={`btn chapter-kind${noteKind === "reference" ? " is-on" : ""}`}
                    onClick={() => setNoteKind("reference")}
                  >
                    {pick(language, "Referencia", "Reference", "Referencia")}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder={
                    noteKind === "reference"
                      ? pick(language, "Obra/autor que se menciona aquí...", "Work/author mentioned here...", "Obra/autor que se menciona aquí...")
                      : pick(language, "Anotación sobre este capítulo...", "A note about this chapter...", "Anotación sobre este capítulo...")
                  }
                />
                <div className="chapter-note-actions">
                  <button type="button" className="btn" onClick={() => setOpenFor(null)} disabled={saving}>
                    {pick(language, "Cancelar", "Cancel", "Cancelar")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => submitNote(chapter.id)}
                    disabled={saving || !noteText.trim()}
                  >
                    {pick(language, "Guardar", "Save", "Gardar")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn chapter-add-note"
                onClick={() => {
                  setOpenFor(chapter.id);
                  setNoteText("");
                  setNoteKind("note");
                }}
              >
                <Icon name="plus" size={12} /> {pick(language, "Anotación", "Annotation", "Anotación")}
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};
