import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { useConfirm } from "../lib/confirm";
import { TopBar } from "../components/TopBar";
import { getUserProfile, type UserProfile } from "../lib/communityApi";
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

// Redimensiona el avatar a un thumbnail pequeño (máx 192px, JPEG) antes de
// guardarlo: las fotos de móvil pesan varios MB y se guardaban en base64 tal
// cual, inflando cada lista de miembros/comentarios. object-fit:cover recorta.
const AVATAR_MAX_PX = 192;
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(dataUrl); // si no carga, guarda el original
      img.onload = () => {
        const scale = Math.min(1, AVATAR_MAX_PX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = dataUrl;
    };
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
  const confirm = useConfirm();
  const params = useParams();
  const userId = params.userId ?? activeUser.id;
  const profileUser = users.find((user) => user.id === userId) ?? activeUser;
  const isOwnProfile = profileUser.id === activeUser.id;
  const [aliasInput, setAliasInput] = useState(profileUser.alias);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activityExpanded, setActivityExpanded] = useState(false);

  useEffect(() => {
    setAliasInput(profileUser.alias);
  }, [profileUser.alias]);

  useEffect(() => {
    let active = true;
    setProfile(null);
    void getUserProfile(userId)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const finishedBooks = profile?.books.filter((b) => b.shelf === "finished") ?? [];
  const readingBooks = profile?.books.filter((b) => b.shelf === "reading") ?? [];

  const canManageUser = activeUser.role === "admin" && !isOwnProfile;
  const isTargetAdmin = (profileUser.role ?? "member") === "admin";

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenShareModal} onLogout={onLogout} />
      <section className="page-section profile-page">
        <div className="profile-stack">
          <div className="profile-hero">
            <div className="profile-head">
              <Avatar user={profile ? { ...profileUser, id: profile.user.id, alias: profile.user.alias, avatarDataUrl: profile.user.avatarUrl } : profileUser} size={74} />
              <div>
                <h2>{profile?.user.alias ?? profileUser.alias}</h2>
                <p className="hint">{(profile?.user.role ?? profileUser.role) === "admin" ? pick(language, "Administra el club", "Club admin", "Administra o club") : pick(language, "Miembro del club", "Club member", "Membro do club")}</p>
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
                    onToast(pick(language, "Foto eliminada. Vuelve tu avatar de iniciales.", "Photo removed. Your initials avatar is now shown.", "Foto eliminada. Agora móstrase o teu avatar con iniciais."));
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
                    <button type="submit" className="btn btn-primary">
                      {pick(language, "Guardar", "Save", "Gardar")}
                    </button>
                  </div>
                </label>
              </form>
            ) : null}
          </div>

          {profile && profile.books.length > 0 ? (
            <article className="settings-card profile-reads">
              <div className="section-head">
                <h3><Icon name="book" /> {pick(language, "Lecturas", "Reading", "Lecturas")}</h3>
                <span className="hint">
                  {profile.finishedCount} {pick(language, "leídos", "read", "lidos")}
                  {profile.avgRating != null ? ` · ★ ${profile.avgRating}` : ""}
                </span>
              </div>

              {readingBooks.length > 0 ? (
                <>
                  <h4 className="profile-reads-sub profile-reads-sub-reading">{pick(language, "Leyendo ahora", "Reading now", "Lendo agora")}</h4>
                  <div className="profile-book-list">
                    {readingBooks.map((b) => (
                      <Link key={b.bookId} to={`/book/${b.bookId}`} className="profile-book">
                        {b.coverUrl ? <img className="profile-book-cover" src={b.coverUrl} alt="" loading="lazy" /> : <span className="profile-book-cover profile-book-cover-empty"><Icon name="book" size={14} /></span>}
                        <span className="profile-book-meta">
                          <strong>{b.title}</strong>
                          {b.totalChapters ? <span className="hint">{b.chaptersDone}/{b.totalChapters} {pick(language, "cap.", "ch.", "cap.")}</span> : null}
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}

              {finishedBooks.length > 0 ? (
                <>
                  <h4 className="profile-reads-sub profile-reads-sub-finished">{pick(language, "Leídos", "Read", "Lidos")}</h4>
                  <div className="profile-book-list">
                    {finishedBooks.map((b) => (
                      <Link key={b.bookId} to={`/book/${b.bookId}`} className="profile-book">
                        {b.coverUrl ? <img className="profile-book-cover" src={b.coverUrl} alt="" loading="lazy" /> : <span className="profile-book-cover profile-book-cover-empty"><Icon name="book" size={14} /></span>}
                        <span className="profile-book-meta">
                          <strong>{b.title}</strong>
                          {b.rating ? <span className="profile-book-rating">{"★".repeat(b.rating)}</span> : null}
                          {b.review ? <span className="profile-book-review">{b.review}</span> : null}
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
            </article>
          ) : profile ? (
            <p className="hint profile-no-reads">{isOwnProfile
              ? pick(language, "Aún no has leído nada.", "You haven't read anything in the club yet.", "Aínda non liches nada no club.")
              : pick(language, "Aún no ha leído nada.", "Hasn't read anything in the club yet.", "Aínda non leu nada no club.")}</p>
          ) : null}

          {profile && profile.activity && profile.activity.length > 0 ? (
            <article className="settings-card profile-activity">
              <div className="section-head">
                <h3><Icon name="spark" /> {pick(language, "Actividad reciente", "Recent activity", "Actividade recente")}</h3>
              </div>
              <ul className="profile-activity-list">
                {(activityExpanded ? profile.activity : profile.activity.slice(0, 10)).map((ev, i) => (
                  <li key={`${ev.bookId}-${ev.at}-${i}`} className="profile-activity-item">
                    <Link to={`/book/${ev.bookId}`} className="profile-activity-link">
                      <span className="profile-activity-text">
                        {ev.kind === "comment"
                          ? pick(language, `Comentó en «${ev.bookTitle}»`, `Commented on “${ev.bookTitle}”`, `Comentou en «${ev.bookTitle}»`)
                          : pick(language, `Propuso «${ev.bookTitle}»`, `Proposed “${ev.bookTitle}”`, `Propuxo «${ev.bookTitle}»`)}
                        {ev.text ? <span className="profile-activity-quote"> · «{ev.text}»</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {activeUser.role === "admin" && !activityExpanded && profile.activity.length > 10 ? (
                <button type="button" className="btn btn-tiny" onClick={() => setActivityExpanded(true)}>
                  {pick(language, "Mostrar más", "Show more", "Amosar máis")}
                </button>
              ) : null}
            </article>
          ) : null}

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
                  const okDelete = await confirm({
                    title: pick(language, "¿Eliminar este usuario del club?", "Remove this user from the club?", "Eliminar este usuario do club?"),
                    message: pick(language, "Es una decisión de moderación visible para el club.", "It's a moderation decision visible to the club.", "É unha decisión de moderación visible para o club."),
                    confirmLabel: pick(language, "Eliminar", "Remove", "Eliminar"),
                    danger: true
                  });
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
