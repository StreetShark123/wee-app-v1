import { useState } from "react";
import { Link } from "react-router-dom";
import { AppFooter } from "../components/AppFooter";
import { Icon } from "../components/Icon";
import { PushSettings } from "../components/PushSettings";
import { ReadingSettings } from "../components/ReadingSettings";
import { pick, useI18n } from "../lib/i18n";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "../lib/usageAnalytics";

// Ajustes: todo lo que NO es "quién eres" ni "qué lees" (eso vive en Tú).
// Notificaciones, accesibilidad, datos/privacidad, el club y la sesión.
interface SettingsPageProps {
  communityName?: string;
  onExport: () => Promise<void>;
  onLogout: () => void;
  onToast: (message: string) => void;
}

export const SettingsPage = ({ communityName, onExport, onLogout, onToast }: SettingsPageProps) => {
  const { language } = useI18n();
  const [optedOut, setOptedOut] = useState(isAnalyticsOptedOut());

  return (
    <main>
      <div className="me-page">
        <div className="section-head">
          <h2><Icon name="settings" /> {pick(language, "Ajustes", "Settings", "Axustes")}</h2>
        </div>

        {/* Tus datos */}
        <section className="page-section">
          <div className="section-head"><h3><Icon name="shield" /> {pick(language, "Tus datos", "Your data", "Os teus datos")}</h3></div>
          <p className="hint">{pick(language, "Guardamos lo justo para que el club funcione. Sin anuncios, sin perfilado, sin cobros.", "We store only what the club needs. No ads, no profiling, no charges.", "Gardamos o xusto. Sen anuncios, sen perfilado, sen cobros.")}</p>
          <div className="me-actions-row">
            <button type="button" className="btn" onClick={() => void onExport()}>
              <Icon name="download" size={14} /> {pick(language, "Exportar mi copia", "Export my copy", "Exportar a miña copia")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const next = !optedOut;
                setAnalyticsOptOut(next);
                setOptedOut(next);
                onToast(next
                  ? pick(language, "Medición de uso desactivada (al recargar).", "Usage measurement off (on reload).", "Medición desactivada (ao recargar).")
                  : pick(language, "Medición de uso activada (al recargar).", "Usage measurement on (on reload).", "Medición activada (ao recargar).")
                );
              }}
            >
              <Icon name={optedOut ? "eyeOff" : "eye"} size={14} /> {optedOut
                ? pick(language, "Activar medición anónima", "Turn anonymous measurement on", "Activar medición anónima")
                : pick(language, "Desactivar medición de uso", "Turn usage measurement off", "Desactivar medición")}
            </button>
          </div>
        </section>

        {/* Notificaciones (Web Push) */}
        <PushSettings />

        {/* Accesibilidad de lectura */}
        <ReadingSettings />

        {/* El club */}
        <section className="page-section">
          <div className="section-head"><h3><Icon name="users" /> {pick(language, "El club", "The club", "O club")}</h3></div>
          <Link to="/community" className="me-link-row">
            <Icon name="settings" size={14} /> {communityName ?? pick(language, "Tu club", "Your club", "O teu club")} · {pick(language, "miembros, normas y ajustes", "members, rules & settings", "membros, normas e axustes")}
          </Link>
          <Link to="/communities" className="me-link-row">
            <Icon name="link" size={14} /> {pick(language, "Cambiar de club o unirme a otro", "Switch club or join another", "Cambiar de club ou unirme a outro")}
          </Link>
        </section>

        {/* Sesión */}
        <section className="page-section">
          <button type="button" className="btn me-logout" onClick={onLogout}>
            <Icon name="logout" size={14} /> {pick(language, "Cerrar sesión", "Log out", "Pechar sesión")}
          </button>
        </section>

        <AppFooter />
      </div>
    </main>
  );
};
