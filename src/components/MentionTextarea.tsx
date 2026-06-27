import { useRef, useState } from "react";
import type { ClubMemberLite } from "../lib/communityApi";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: ClubMemberLite[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  className?: string;
}

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const MentionTextarea = ({ value, onChange, members, placeholder, rows = 2, autoFocus, className }: MentionTextareaProps) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);

  // Detecta si se está escribiendo un @token justo antes del cursor.
  const refresh = (text: string, pos: number) => {
    const before = text.slice(0, pos);
    const match = before.match(/(^|\s)@([\p{L}\p{N}_.\-]*)$/u);
    if (match) {
      setQuery(match[2]);
      setCaret(pos);
    } else {
      setQuery(null);
    }
  };

  const suggestions =
    query !== null
      ? members
          .filter((m) => {
            if (query === "") return true;
            return norm(m.alias).startsWith(norm(query)) || norm(m.alias).includes(norm(query));
          })
          .slice(0, 6)
      : [];
  const activeIdx = suggestions.length > 0 ? Math.min(active, suggestions.length - 1) : 0;
  const open = query !== null && suggestions.length > 0;

  const pick = (alias: string) => {
    const text = value;
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}_.\-]*)$/u, `@${alias.replace(/\s+/g, "")} `);
    const after = text.slice(caret);
    const next = before + after;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = before.length;
      }
    });
  };

  return (
    <div className="mention-wrap">
      <textarea
        ref={ref}
        className={className}
        rows={rows}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
        aria-controls="mention-listbox"
        aria-activedescendant={open ? `mention-opt-${activeIdx}` : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          refresh(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            pick(suggestions[activeIdx].alias);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setQuery(null);
          }
        }}
        onKeyUp={(event) => {
          // Las flechas ya se gestionan en keydown; no recalcular con ellas.
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
          const el = event.currentTarget;
          refresh(el.value, el.selectionStart ?? el.value.length);
        }}
        onBlur={() => window.setTimeout(() => setQuery(null), 150)}
      />
      {open ? (
        <ul className="mention-list" role="listbox" id="mention-listbox">
          {suggestions.map((m, i) => (
            <li key={m.id} role="option" id={`mention-opt-${i}`} aria-selected={i === activeIdx}>
              <button
                type="button"
                className={`mention-option${i === activeIdx ? " is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m.alias)}
              >
                @{m.alias}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
