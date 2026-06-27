import { useEffect, useRef, useState } from "react";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

// Preset único de reacciones (antes había dos listas distintas en notas y comentarios).
export const REACTION_PRESET = ["👍", "❤️", "🔥", "😍", "🤔", "💡", "😂", "😮", "😢", "👏", "🙌", "💯", "📖", "🤯", "✨", "🥲"];

export const ReactionPicker = ({ onPick }: { onPick: (emoji: string) => void }) => {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="reaction-add" ref={rootRef}>
      <button
        type="button"
        className="reaction-chip reaction-add-btn"
        aria-expanded={open}
        aria-label={pick(language, "Añadir reacción", "Add reaction", "Engadir reacción")}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="heart" size={13} /> <span aria-hidden="true">+</span>
      </button>
      {open ? (
        <>
          <div className="reaction-picker-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="reaction-picker" role="menu">
            {REACTION_PRESET.map((e) => (
              <button
                key={e}
                type="button"
                className="reaction-emoji"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};
