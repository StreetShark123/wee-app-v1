import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { pick, useI18n } from "../lib/i18n";
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

// Lista completa de quién está leyendo el libro (progreso / terminado / reseña).
// Se abre desde la fila discreta de avatares de la ficha. Portal a body.
export const ReadersModal = ({ members, total, bookStatus, clubMembers, onClose }: ReadersModalProps) => {
  const { language } = useI18n();
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onEsc); document.body.style.overflow = prev; };
  }, [onClose]);

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
          {members.map((member) => (
            <li key={member.userId} className="book-member">
              <Link to={`/profile/${member.userId}`} className="book-member-row book-member-link" onClick={onClose}>
                <span className="book-member-who">
                  <UserDot alias={member.alias} {...styleFor(clubMembers, member.userId)} />
                  {member.alias}
                </span>
                <span className="book-member-state">
                  {member.shelf === "finished" ? (
                    <>
                      {member.rating ? <span className="book-member-rating">{"★".repeat(member.rating)}</span> : null}
                      {pick(language, "Terminado", "Finished", "Rematado")}
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
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
};
