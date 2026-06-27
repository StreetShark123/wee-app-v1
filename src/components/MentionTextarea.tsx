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
        onChange={(event) => {
          onChange(event.target.value);
          refresh(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onKeyUp={(event) => {
          const el = event.currentTarget;
          refresh(el.value, el.selectionStart ?? el.value.length);
        }}
        onBlur={() => window.setTimeout(() => setQuery(null), 120)}
      />
      {query !== null && suggestions.length > 0 ? (
        <ul className="mention-list" role="listbox">
          {suggestions.map((m) => (
            <li key={m.id}>
              <button type="button" className="mention-option" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m.alias)}>
                @{m.alias}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
