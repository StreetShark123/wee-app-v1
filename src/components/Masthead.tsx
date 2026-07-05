import { Link } from "react-router-dom";
import { getSelectedCommunity } from "../lib/communitySession";

// Cabecera de app: el CLUB como identidad — título centrado con presencia
// (cabecera de revista). Los avisos personales viven ahora en la pantalla social
// ("para ti"), no en una campana aparte.
interface MastheadProps {
  communityName?: string;
}

export const Masthead = ({ communityName }: MastheadProps) => {
  const name = communityName ?? getSelectedCommunity()?.name ?? "wee.";
  return (
    <header className="masthead">
      <Link to="/home" className="masthead-title">{name}</Link>
    </header>
  );
};
