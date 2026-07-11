import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { UserDot } from "./UserBadge";
import { pick, useI18n } from "../lib/i18n";

type ClubListItem = { community_id: string; name: string; role: "admin" | "member" };

interface ClubQuickModalProps {
  communityName: string;
  communityId?: string;
  members: Array<{ id: string; alias: string; role: "admin" | "member" }>;
  myCommunities: ClubListItem[];
  readingCount: number;
  finishedCount: number;
  onSwitchCommunity: (id: string) => Promise<unknown>;
  onToast: (message: string) => void;
  onClose: () => void;
}

// Menú LIGERO de club (desde el nombre en el header): vistazo rápido (miembros +
// actividad) y cambio rápido entre tus clubs. SIN editar/crear/gestionar — eso
// vive solo en Ajustes (aquí solo un enlace discreto para ir allí).
export const ClubQuickModal = ({ communityName, communityId, members, myCommunities, readingCount, finishedCount, onSwitchCommunity, onToast, onClose }: ClubQuickModalProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const switchClub = async (id: string): Promise<void> => {
    if (id === communityId || switchingId) return;
    setSwitchingId(id);
    try {
      await onSwitchCommunity(id);
      onToast(pick(language, "Club cambiado.", "Club switched.", "Club cambiado."));
      onClose();
      navigate("/home");
    } catch {
      onToast(pick(language, "No se pudo cambiar de club.", "Couldn't switch club.", "Non se puido cambiar de club."));
    } finally {
      setSwitchingId(null);
    }
  };

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => (switchingId ? undefined : onClose())}>
      <div className="modal-card modal-card-compact club-quick-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{communityName}</h2>
            <p>{pick(language, `${members.length} ${members.length === 1 ? "miembro" : "miembros"}`, `${members.length} ${members.length === 1 ? "member" : "members"}`, `${members.length} ${members.length === 1 ? "membro" : "membros"}`)}</p>
          </div>
          <button type="button" className="btn btn-icon-compact" onClick={onClose} aria-label={pick(language, "Cerrar", "Close", "Pechar")}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="club-quick-stats">
          <div className="club-quick-stat"><strong>{members.length}</strong><span>{pick(language, "miembros", "members", "membros")}</span></div>
          <div className="club-quick-stat"><strong>{readingCount}</strong><span>{pick(language, "en lectura", "reading", "en lectura")}</span></div>
          <div className="club-quick-stat"><strong>{finishedCount}</strong><span>{pick(language, "leídos", "read", "lidos")}</span></div>
        </div>

        {members.length > 0 ? (
          <div className="club-quick-avatars" aria-hidden="true">
            {members.slice(0, 8).map((m, i) => (
              <UserDot key={m.id} alias={m.alias} colorIndex={i} />
            ))}
            {members.length > 8 ? <span className="club-quick-more">+{members.length - 8}</span> : null}
          </div>
        ) : null}

        {myCommunities.length > 1 ? (
          <div className="club-quick-switch">
            <span className="club-quick-switch-label">{pick(language, "Cambiar de club", "Switch club", "Cambiar de club")}</span>
            <div className="club-switch-list">
              {myCommunities.map((c) => {
                const current = c.community_id === communityId;
                return (
                  <button
                    key={c.community_id}
                    type="button"
                    className={`club-switch-row${current ? " is-current" : ""}`}
                    disabled={current || switchingId != null}
                    onClick={() => void switchClub(c.community_id)}
                  >
                    <Icon name={current ? "check" : "users"} size={14} />
                    <span className="club-switch-name">{c.name}</span>
                    {current ? (
                      <span className="club-switch-tag">{pick(language, "actual", "current", "actual")}</span>
                    ) : switchingId === c.community_id ? (
                      <span className="club-switch-tag">{pick(language, "cambiando…", "switching…", "cambiando…")}</span>
                    ) : (
                      <span className="club-switch-go" aria-hidden="true">›</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <button type="button" className="btn club-quick-manage" onClick={() => { onClose(); navigate("/settings"); }}>
          <Icon name="settings" size={14} /> {pick(language, "Gestionar en Ajustes", "Manage in Settings", "Xestionar en Axustes")}
        </button>
      </div>
    </div>,
    document.body
  );
};
