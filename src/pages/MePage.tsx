import { useState } from "react";
import { Link } from "react-router-dom";
import { AppFooter } from "../components/AppFooter";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { PushSettings } from "../components/PushSettings";
import { ReadingSettings } from "../components/ReadingSettings";
import { pick, useI18n } from "../lib/i18n";
import { AVATAR_MAX_PX, imageFileToDataUrl } from "../lib/imageCompress";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "../lib/usageAnalytics";
import type { User } from "../lib/types";

// "Tú": la persona en UNA página compacta — perfil editable, tus datos,
// el club y la sesión. Absorbe el antiguo SettingsPage y las entradas del
// menú del avatar; el colofón (AppFooter) vive aquí al pie.
interface MePageProps {
  activeUser: User;
  communityName?: string;
  onUpdateAvatar: (userId: string, avatarDataUrl: string | undefined) => Promise<void>;
  onUpdateAlias: (userId: string, alias: string) => Promise<void>;
  onExport: () => Promise<void>;
  onLogout: () => void;
  onToast: (message: string) => void;
}

export const MePage = ({ activeUser, communityName, onUpdateAvatar, onUpdateAlias, onExport, onLogout, onToast }: MePageProps) => {
  const { language } = useI18n();
  const [alias, setAlias] = useState(activeUser.alias);
  const [savingAlias, setSavingAlias] = useState(false);
  const [optedOut, setOptedOut] = useState(isAnalyticsOptedOut());

  const saveAlias = async (): Promise<void> => {
    const clean = alias.trim();
    if (!clean || clean === activeUser.alias || savingAlias) return;
    setSavingAlias(true);
    try {
      await onUpdateAlias(activeUser.id, clean);
      onToast(pick(language, "Alias actualizado.", "Alias updated.", "Alias actualizado."));
    } finally {
      setSavingAlias(false);
    }
  };

  return (
    <main>
      <div className="me-page">
        {/* Perfil */}
        <section className="page-section me-hero">
          <div className="me-hero-head">
            <Avatar user={activeUser} size={64} />
            <div className="me-hero-id">
              <strong className="me-hero-alias">{activeUser.alias}</strong>
              <span className="hint">{activeUser.role === "admin"
                ? pick(language, "Administras el club", "You run the club", "Administras o club")
                : pick(language, "Miembro del club", "Club member", "Membro do club")}</span>
            </div>
          </div>
          <div className="me-hero-actions">
            <label className="btn">
              <Icon name="camera" size={14} /> {pick(language, "Cambiar foto", "Change photo", "Cambiar foto")}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void imageFileToDataUrl(file, AVATAR_MAX_PX).then((dataUrl) => {
                    void onUpdateAvatar(activeUser.id, dataUrl);
                    onToast(pick(language, "Foto de perfil actualizada.", "Profile photo updated.", "Foto de perfil actualizada."));
                  });
                }}
              />
            </label>
            {activeUser.avatarDataUrl ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void onUpdateAvatar(activeUser.id, undefined);
                  onToast(pick(language, "Foto eliminada.", "Photo removed.", "Foto eliminada."));
                }}
              >
                <Icon name="trash" size={14} /> {pick(language, "Quitar foto", "Remove photo", "Quitar foto")}
              </button>
            ) : null}
          </div>
          <label className="me-alias-row">
            {pick(language, "Alias", "Alias", "Alias")}
            <span className="me-alias-controls">
              <input value={alias} onChange={(event) => setAlias(event.target.value)} maxLength={40} />
              <button type="button" className="btn btn-primary" disabled={savingAlias || !alias.trim() || alias.trim() === activeUser.alias} onClick={() => void saveAlias()}>
                {pick(language, "Guardar", "Save", "Gardar")}
              </button>
            </span>
          </label>
          <Link to={`/profile/${activeUser.id}`} className="me-link-row">
            <Icon name="eye" size={14} /> {pick(language, "Ver mi perfil público (mis lecturas)", "See my public profile (my reads)", "Ver o meu perfil público")}
          </Link>
        </section>

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
