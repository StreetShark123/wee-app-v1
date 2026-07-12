import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { pick, useI18n } from "../lib/i18n";
import type { AppLanguage } from "../lib/types";
import { Icon } from "./Icon";
import { UserDot, styleFor } from "./UserBadge";
import type { BookMemberProgress, ClubMemberLite } from "../lib/communityApi";

interface ReadersModalProps {
  members: BookMemberProgress[];
  total: number;
  bookStatus: string;
  clubMembers: ClubMemberLite[];
  onClose: () => void;
}

// Relativa corta de "última actividad en este libro" (updatedAt del member_book).
const timeAgo = (ms: number | undefined, language: AppLanguage): string => {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 3600000) return pick(language, "hace un rato", "moments ago", "hai un pouco");
  if (diff < 86400000) return pick(language, `hace ${Math.floor(diff / 3600000)} h`, `${Math.floor(diff / 3600000)}h ago`, `hai ${Math.floor(diff / 3600000)} h`);
  const days = Math.floor(diff / 86400000);
  if (days < 30) return pick(language, `hace ${days} d`, `${days}d ago`, `hai ${days} d`);
  const months = Math.max(1, Math.floor(days / 30));
  return pick(language, `hace ${months} mes`, `${months}mo ago`, `hai ${months} mes`);
};

// Lista completa de quién está leyendo el libro: los que AÚN leen primero (los
// que "quedan"), luego los que ya lo completaron. Cada uno con su última
// actividad en este libro. Se abre desde los avatares de la ficha. Portal a body.
export const ReadersModal = ({ members, total, bookStatus, clubMembers, onClose }: ReadersModalProps) => {
  const { language } = useI18n();
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onEsc); document.body.style.overflow = prev; };
  }, [onClose]);

  const ordered = [...members].sort(
    (a, b) => (a.shelf === "finished" ? 1 : 0) - (b.shelf === "finished" ? 1 : 0) || b.chaptersDone - a.chaptersDone
  );

  return createPortal(
    <div className="readers-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="readers-modal" onClick={(e) => e.stopPropagation()}>
        <div className="readers-modal-head">
          <h3><Icon name="users" /> {pick(language, "Quién lo está leyendo", "Who's reading it", "Quen o está lendo")}</h3>
          <button type="button" className="btn btn-icon-compact" onClick={onClose} aria-label={pick(language, "Cerrar", "Close", "Pechar")}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <ul className="book-members">
          {ordered.map((member) => {
            const done = member.shelf === "finished";
            const seen = timeAgo(done ? (member.finishedAt ?? member.updatedAt) : member.updatedAt, language);
            return (
              <li key={member.userId} className="book-member">
                <Link to={`/profile/${member.userId}`} className="book-member-row book-member-link" onClick={onClose}>
                  <span className="book-member-who">
                    <UserDot alias={member.alias} done={done} {...styleFor(clubMembers, member.userId)} />
                    <span className="book-member-id">
                      <span className="book-member-alias">{member.alias}</span>
                      <span className="book-member-seen">
                        {done ? pick(language, "Completado", "Completed", "Completado") : pick(language, "Activo", "Active", "Activo")}{seen ? ` · ${seen}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="book-member-state">
                    {done ? (
                      <>
                        {member.rating ? <span className="book-member-rating">{"★".repeat(member.rating)}</span> : null}
                        <Icon name="check" size={15} />
                      </>
                    ) : total > 0 ? (
                      <span className="member-mini-bar" aria-label={`${Math.round((member.chaptersDone / total) * 100)}%`}>
                        <span className="member-mini-fill" style={{ width: `${Math.min(100, Math.round((member.chaptersDone / total) * 100))}%` }} />
                      </span>
                    ) : (
                      pick(language, "Leyendo", "Reading", "Lendo")
                    )}
                  </span>
                </Link>
                {bookStatus === "finished" && member.review ? (
                  <p className="book-member-review">{member.review}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
};
