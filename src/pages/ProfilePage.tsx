import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { generateAlias } from "../lib/aliasGenerator";
import { TopBar } from "../components/TopBar";
import type { User } from "../lib/types";

interface ProfilePageProps {
  activeUser: User;
  users: User[];
  onLogout: () => void;
  onUpdateAvatar: (userId: string, avatarDataUrl: string | undefined) => Promise<void>;
  onUpdateAlias: (userId: string, alias: string) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<{ ok: boolean; message: string }>;
  onSetUserRole: (userId: string, role: "admin" | "member") => Promise<{ ok: boolean; message: string }>;
  onToast: (message: string) => void;
  onOpenShareModal?: () => void;
}

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

export const ProfilePage = ({
  activeUser,
  users,
  onLogout,
  onUpdateAvatar,
  onUpdateAlias,
  onDeleteUser,
  onSetUserRole,
  onToast,
  onOpenShareModal
}: ProfilePageProps) => {
  const { language } = useI18n();
  const params = useParams();
  const userId = params.userId ?? activeUser.id;
  const profileUser = users.find((user) => user.id === userId) ?? activeUser;
  const isOwnProfile = profileUser.id === activeUser.id;
  const [aliasInput, setAliasInput] = useState(profileUser.alias);

  useEffect(() => {
    setAliasInput(profileUser.alias);
  }, [profileUser.alias]);

  const canManageUser = activeUser.role === "admin" && !isOwnProfile;
  const isTargetAdmin = (profileUser.role ?? "member") === "admin";

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenShareModal} onLogout={onLogout} />
      <section className="page-section">
        <div className="profile-stack">
          <div className="profile-hero">
            <div className="profile-head">
              <Avatar user={profileUser} size={74} />
              <div>
                <h2>{profileUser.alias}</h2>
                <p className="hint">{isTargetAdmin ? pick(language, "Administra el club", "Club admin", "Administra o club") : pick(language, "Miembro del club", "Club member", "Membro do club")}</p>
              </div>
            </div>

            {isOwnProfile ? (
              <div className="profile-upload">
                <label className="btn">
                  <Icon name="camera" /> {pick(language, "Cambiar foto", "Change photo", "Cambiar foto")}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void fileToDataUrl(file).then((dataUrl) => {
                        void onUpdateAvatar(activeUser.id, dataUrl);
                        onToast(pick(language, "Foto de perfil actualizada.", "Profile photo updated.", "Foto de perfil actualizada."));
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void onUpdateAvatar(activeUser.id, undefined);
                    onToast(pick(language, "Foto eliminada. Ahora se muestra tu avatar con iniciales.", "Photo removed. Your initials avatar is now shown.", "Foto eliminada. Agora móstrase o teu avatar con iniciais."));
                  }}
                >
                  <Icon name="trash" /> {pick(language, "Quitar foto", "Remove photo", "Quitar foto")}
                </button>
              </div>
            ) : null}

            {isOwnProfile ? (
              <form
                className="alias-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = aliasInput.trim();
                  if (!next) {
                    onToast(pick(language, "El alias es obligatorio.", "Alias is required.", "O alias é obrigatorio."));
                    return;
                  }
                  void onUpdateAlias(activeUser.id, next);
                  onToast(pick(language, "Alias actualizado.", "Alias updated.", "Alias actualizado."));
                }}
              >
                <label>
                  {pick(language, "Alias", "Alias", "Alias")}
                  <div className="alias-row">
                    <input
                      value={aliasInput}
                      onChange={(event) => setAliasInput(event.target.value)}
                      placeholder={pick(language, "Tu alias visible", "Your visible alias", "O teu alias visible")}
                    />
                    <button type="button" className="btn dice-btn" onClick={() => setAliasInput(generateAlias())} title={pick(language, "Generar alias aleatorio", "Generate random alias", "Xerar alias aleatorio")}>
                      <Icon name="dice" size={14} />
                    </button>
                    <button type="submit" className="btn btn-primary">
                      {pick(language, "Guardar", "Save", "Gardar")}
                    </button>
                  </div>
                </label>
              </form>
            ) : null}
          </div>

          <div className="profile-actions">
            {isOwnProfile ? (
              <button type="button" className="btn" onClick={() => onLogout()}>
                <Icon name="logout" /> {pick(language, "Cerrar sesión", "Log out", "Pechar sesión")}
              </button>
            ) : null}
            {canManageUser ? (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const nextRole: "admin" | "member" = isTargetAdmin ? "member" : "admin";
                  const result = await onSetUserRole(profileUser.id, nextRole);
                  onToast(result.message);
                }}
              >
                <Icon name="trophy" />
                {isTargetAdmin
                  ? pick(language, "Quitar admin", "Remove admin", "Quitar admin")
                  : pick(language, "Nombrar admin", "Promote to admin", "Nomear admin")}
              </button>
            ) : null}
            {canManageUser ? (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const okDelete = window.confirm(pick(language, "¿Eliminar este usuario del club?", "Remove this user from the community?", "Eliminar este usuario da comunidade?"));
                  if (!okDelete) return;
                  const result = await onDeleteUser(profileUser.id);
                  onToast(result.message);
                }}
              >
                <Icon name="trash" /> {pick(language, "Eliminar usuario", "Delete user", "Eliminar usuario")}
              </button>
            ) : null}
            <Link to="/home" className="btn btn-nav">
              <Icon name="arrowLeft" /> {pick(language, "Volver al inicio", "Back to home", "Volver ao inicio")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};
