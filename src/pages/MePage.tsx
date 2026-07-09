import { useState } from "react";
import { Link } from "react-router-dom";
import { AppFooter } from "../components/AppFooter";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { AVATAR_MAX_PX, imageFileToDataUrl } from "../lib/imageCompress";
import type { User } from "../lib/types";

// "Tú": quién eres (perfil) — independiente del club. La biblioteca personal
// (quiero leer / leyendo / leídos, a título individual) vive aquí también.
// Los ajustes de la app (notificaciones, accesibilidad, datos, club, sesión)
// se mudaron a /settings (la ruedita del masthead).
interface MePageProps {
  activeUser: User;
  onUpdateAvatar: (userId: string, avatarDataUrl: string | undefined) => Promise<void>;
  onUpdateAlias: (userId: string, alias: string) => Promise<void>;
  onToast: (message: string) => void;
}

export const MePage = ({ activeUser, onUpdateAvatar, onUpdateAlias, onToast }: MePageProps) => {
  const { language } = useI18n();
  const [alias, setAlias] = useState(activeUser.alias);
  const [savingAlias, setSavingAlias] = useState(false);

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

        <AppFooter />
      </div>
    </main>
  );
};
