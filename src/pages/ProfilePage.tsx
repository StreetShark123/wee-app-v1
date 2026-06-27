import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { PostCard } from "../components/PostCard";
import { pick, translateBadge, translateRankTitle, useI18n } from "../lib/i18n";
import { generateAlias } from "../lib/aliasGenerator";
import { TopBar } from "../components/TopBar";
import type { Post, User, UserCommunityStats } from "../lib/types";

interface ProfilePageProps {
  activeUser: User;
  users: User[];
  posts: Post[];
  userCommunityStatsById: Map<string, UserCommunityStats>;
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
  posts,
  userCommunityStatsById,
  onLogout,
  onUpdateAvatar,
  onUpdateAlias,
  onDeleteUser,
  onSetUserRole,
  onToast,
  onOpenShareModal
}: ProfilePageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const userId = params.userId ?? activeUser.id;
  const profileUser = users.find((user) => user.id === userId) ?? activeUser;
  const isOwnProfile = profileUser.id === activeUser.id;
  const [aliasInput, setAliasInput] = useState(profileUser.alias);

  useEffect(() => {
    setAliasInput(profileUser.alias);
  }, [profileUser.alias]);

  const userPosts = useMemo(
    () => posts.filter((post) => post.userId === profileUser.id),
    [posts, profileUser.id]
  );
  const communityStats = userCommunityStatsById.get(profileUser.id);
  const canSeeScores = activeUser.role === "admin";
  const canManageUser = activeUser.role === "admin" && !isOwnProfile;
  const isTargetAdmin = (profileUser.role ?? "member") === "admin";
  const recentComments = useMemo(
    () =>
      posts
        .flatMap((post) =>
          (post.comments ?? [])
            .filter((comment) => comment.userId === profileUser.id)
            .map((comment) => ({ comment, postId: post.id }))
        )
        .sort((a, b) => b.comment.createdAt - a.comment.createdAt)
        .slice(0, 5),
    [posts, profileUser.id]
  );

  const generatedAlias = (): void => {
    setAliasInput(generateAlias());
  };

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
              <p>{pick(language, `${userPosts.length} libros compartidos`, `${userPosts.length} shared posts`, `${userPosts.length} novas compartidas`)}</p>
            </div>
          </div>
          {canSeeScores && communityStats ? (
            <div className="profile-rank-card">
              <h3>{translateRankTitle(language, communityStats.rankTitle)} · {pick(language, "nivel", "level", "nivel")} {communityStats.level}</h3>
              <p>
                aura {communityStats.aura} · {pick(language, "nivel", "level", "nivel")} {communityStats.level} ·
                {` `}{communityStats.highQualityCount} {pick(language, "aportes útiles", "useful contributions", "achegas útiles")}
              </p>
              <div className="profile-level-bar">
                <span style={{ width: `${Math.round(communityStats.levelProgress * 100)}%` }} />
              </div>
              {communityStats.badges.length > 0 ? (
                <div className="chips">
                  {communityStats.badges.map((badge) => (
                    <span key={badge} className="chip chip-subtopic">{translateBadge(language, badge)}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

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
                  <button type="button" className="btn dice-btn" onClick={generatedAlias} title={pick(language, "Generar alias aleatorio", "Generate random alias", "Xerar alias aleatorio")}>
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

          {!isOwnProfile ? (
            <article className="settings-card">
            <h3><Icon name="comment" /> {pick(language, "Comentarios recientes", "Recent comments", "Comentarios recentes")}</h3>
            {recentComments.length === 0 ? (
              <p className="hint">{pick(language, "Todavía no hay comentarios recientes.", "No recent comments yet.", "Aínda non hai comentarios recentes.")}</p>
            ) : (
              <div className="settings-known-topics">
                {recentComments.map(({ comment, postId }) => (
                  <Link key={comment.id} to={`/post/${postId}`} className="chip chip-action">
                    {comment.text.slice(0, 72)}
                  </Link>
                ))}
              </div>
            )}
            </article>
          ) : null}

          <article className="settings-card profile-posts-card">
            <div className="section-head">
              <h3><Icon name="news" /> {pick(language, "Libros", "Posts", "Publicacións")}</h3>
              {isOwnProfile ? (
                <Link to={`/profile/${profileUser.id}/posts`} className="link-btn">
                  <Icon name="news" /> {pick(language, "Gestionar", "Manage", "Xestionar")}
                </Link>
              ) : null}
            </div>
            {userPosts.length === 0 ? (
              <p className="hint">
                {pick(language, "Este perfil todavía no ha compartido libros.", "This profile has not shared posts yet.", "Este perfil aínda non compartiu novas.")}
              </p>
            ) : (
              <div className="post-grid">
                {userPosts
                  .slice()
                  .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 8)
                    .map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      author={users.find((user) => user.id === post.userId)}
                      onOpenDetail={(entry) => navigate(`/post/${entry.id}`)}
                    />
                  ))}
              </div>
            )}
          </article>

          <div className="profile-actions">
            {isOwnProfile ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onLogout();
                }}
              >
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
