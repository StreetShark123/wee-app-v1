import { useState } from "react";
import { Link } from "react-router-dom";
import { getSelectedCommunity } from "../lib/communitySession";
import { ClubQuickModal } from "./ClubQuickModal";
import { Icon } from "./Icon";
import { pick, useI18n } from "../lib/i18n";

type ClubListItem = { community_id: string; name: string; role: "admin" | "member" };

// Cabecera de app: el CLUB como identidad — el nombre abre un menú LIGERO
// (vistazo rápido + cambio de club) y la ruedita de Ajustes a la derecha.
interface MastheadProps {
  communityName?: string;
  communityId?: string;
  members: Array<{ id: string; alias: string; role: "admin" | "member" }>;
  myCommunities: ClubListItem[];
  readingCount: number;
  finishedCount: number;
  onSwitchCommunity: (id: string) => Promise<unknown>;
  onToast: (message: string) => void;
}

export const Masthead = ({ communityName, communityId, members, myCommunities, readingCount, finishedCount, onSwitchCommunity, onToast }: MastheadProps) => {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const name = communityName ?? getSelectedCommunity()?.name ?? "wee.";
  return (
    <header className="masthead">
      <button type="button" className="masthead-title masthead-title-btn" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        {name} <Icon name="arrowDown" size={12} />
      </button>
      <Link to="/settings" className="masthead-settings" aria-label={pick(language, "Ajustes", "Settings", "Axustes")} title={pick(language, "Ajustes", "Settings", "Axustes")}>
        <Icon name="settings" size={20} />
      </Link>
      {open ? (
        <ClubQuickModal
          communityName={name}
          communityId={communityId}
          members={members}
          myCommunities={myCommunities}
          readingCount={readingCount}
          finishedCount={finishedCount}
          onSwitchCommunity={onSwitchCommunity}
          onToast={onToast}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </header>
  );
};
