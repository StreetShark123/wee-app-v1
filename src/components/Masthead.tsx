import { Link } from "react-router-dom";
import { getSelectedCommunity } from "../lib/communitySession";
import { Icon } from "./Icon";
import { pick, useI18n } from "../lib/i18n";

// Cabecera de app: el CLUB como identidad — título centrado con presencia
// (cabecera de revista) — y la ruedita de Ajustes a la derecha (avisos
// personales viven en la pantalla social "para ti", no aquí).
interface MastheadProps {
  communityName?: string;
}

export const Masthead = ({ communityName }: MastheadProps) => {
  const { language } = useI18n();
  const name = communityName ?? getSelectedCommunity()?.name ?? "wee.";
  return (
    <header className="masthead">
      <Link to="/home" className="masthead-title">{name}</Link>
      <Link to="/settings" className="masthead-settings" aria-label={pick(language, "Ajustes", "Settings", "Axustes")} title={pick(language, "Ajustes", "Settings", "Axustes")}>
        <Icon name="settings" size={20} />
      </Link>
    </header>
  );
};
