import { Link } from "react-router-dom";
import { getSelectedCommunity } from "../lib/communitySession";
import { NotificationsMenu } from "./NotificationsMenu";

// Cabecera de app: el CLUB como identidad — título centrado con presencia
// (cabecera de revista), campana de avisos personales discreta a la derecha.
// Sustituye al TopBar (navegación y usuario viven ahora en el dock inferior).
interface MastheadProps {
  communityName?: string;
}

export const Masthead = ({ communityName }: MastheadProps) => {
  const name = communityName ?? getSelectedCommunity()?.name ?? "wee.";
  return (
    <header className="masthead">
      <Link to="/home" className="masthead-title">{name}</Link>
      <div className="masthead-bell">
        <NotificationsMenu />
      </div>
    </header>
  );
};
