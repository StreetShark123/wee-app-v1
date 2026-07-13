import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Icon, type IconName } from "../components/Icon";
import { PushSettings } from "../components/PushSettings";
import { ReadingSettings } from "../components/ReadingSettings";
import { UserDot } from "../components/UserBadge";
import { communityHealth } from "../lib/communityApi";
import { useConfirm } from "../lib/confirm";
import { pick, useI18n } from "../lib/i18n";
import { AVATAR_MAX_PX, imageFileToDataUrl } from "../lib/imageCompress";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "../lib/usageAnalytics";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import type { AppLanguage, User } from "../lib/types";

type ClubListItem = { community_id: string; name: string; description?: string; role: "admin" | "member" };
type CreateClubInput = { name: string; description?: string; invitePolicy: "admins_only" | "members_allowed"; visibility?: "public" | "private" | "invite"; rulesText?: string };

// "activo hace X": relativa corta a partir de un timestamp (última actividad).
const activeAgo = (ms: number, language: AppLanguage): string => {
  const diff = Date.now() - ms;
  const day = 86400000;
  if (diff < 3600000) return pick(language, "hace poco", "recently", "hai pouco");
  if (diff < day) return pick(language, `hace ${Math.floor(diff / 3600000)} h`, `${Math.floor(diff / 3600000)}h ago`, `hai ${Math.floor(diff / 3600000)} h`);
  const days = Math.floor(diff / day);
  if (days < 30) return pick(language, `hace ${days} d`, `${days}d ago`, `hai ${days} d`);
  const months = Math.max(1, Math.floor(days / 30));
  return pick(language, `hace ${months} mes`, `${months}mo ago`, `hai ${months} mes`);
};

const APP_VERSION = "v0.5.0-beta";
const APP_UPDATED_AT = "2026-07-12";

// Ajustes: índice tipo "Ajustes del sistema" — filas con icono que abren su
// propia sub-sección, en vez de una página larga con todo desplegado. Orden:
// tú (perfil) → el club → el resto (notificaciones/accesibilidad/datos/sesión).
// "Tú" (la otra pestaña) es SOLO biblioteca personal; quién eres vive aquí.
interface SettingsPageProps {
  activeUser: User;
  communityName?: string;
  communityId?: string;
  communityMembers: Array<{ id: string; alias: string; role: "admin" | "member" }>;
  communityOwnerId?: string | null;
  myCommunities: ClubListItem[];
  onSwitchCommunity: (communityId: string) => Promise<unknown>;
  onCreateCommunity: (input: CreateClubInput) => Promise<{ id: string }>;
  onDeleteCommunity: () => Promise<void>;
  onUpdateAvatar: (userId: string, avatarDataUrl: string | undefined) => Promise<void>;
  onUpdateAlias: (userId: string, alias: string) => Promise<void>;
  onExport: () => Promise<void>;
  onLogout: () => void;
  onToast: (message: string) => void;
}

type SectionKey = "profile" | "club" | "notifications" | "accessibility" | "data" | "about" | "session";

const SECTIONS: { key: SectionKey; icon: IconName; label: (l: AppLanguage) => string; hint: (l: AppLanguage) => string }[] = [
  { key: "profile", icon: "user", label: (l) => pick(l, "Perfil", "Profile", "Perfil"), hint: (l) => pick(l, "Foto y alias", "Photo and alias", "Foto e alcume") },
  { key: "club", icon: "users", label: (l) => pick(l, "El club", "The club", "O club"), hint: (l) => pick(l, "Miembros, normas y ajustes", "Members, rules and settings", "Membros, normas e axustes") },
  { key: "notifications", icon: "bell", label: (l) => pick(l, "Notificaciones", "Notifications", "Notificacións"), hint: (l) => pick(l, "Qué avisos quieres recibir", "Which alerts you want", "Que avisos queres recibir") },
  { key: "accessibility", icon: "eye", label: (l) => pick(l, "Accesibilidad de lectura", "Reading accessibility", "Accesibilidade de lectura"), hint: (l) => pick(l, "Tamaño de texto y demás", "Text size and more", "Tamaño de texto e demais") },
  { key: "data", icon: "shield", label: (l) => pick(l, "Tus datos", "Your data", "Os teus datos"), hint: (l) => pick(l, "Exportar y privacidad", "Export and privacy", "Exportar e privacidade") },
  { key: "about", icon: "book", label: (l) => pick(l, "Sobre Wee", "About Wee", "Sobre Wee"), hint: (l) => pick(l, "Qué es y cómo funciona", "What it is and how it works", "Que é e como funciona") },
  { key: "session", icon: "logout", label: (l) => pick(l, "Sesión", "Session", "Sesión"), hint: (l) => pick(l, "Cerrar sesión", "Log out", "Pechar sesión") }
];

export const SettingsPage = ({ activeUser, communityName, communityId, communityMembers, communityOwnerId, myCommunities, onSwitchCommunity, onCreateCommunity, onDeleteCommunity, onUpdateAvatar, onUpdateAlias, onExport, onLogout, onToast }: SettingsPageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [section, setSection] = useState<SectionKey | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState(isAnalyticsOptedOut());
  const isClubAdmin = activeUser.role === "admin";
  // Solo el FUNDADOR ve/puede eliminar el club (el backend también lo exige).
  const isOwner = !!communityOwnerId && communityOwnerId === activeUser.id;
  // Borrado con DOBLE confirmación: (1) diálogo de aviso, (2) teclear el nombre.
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Última actividad por miembro (solo admin: viene de /community/health). Se
  // carga al abrir la sección del club; si falla o no eres admin, no se muestra.
  const [lastActiveById, setLastActiveById] = useState<Record<string, number>>({});
  const [healthLoaded, setHealthLoaded] = useState(false);
  // Modal "crear tu club".
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private" | "invite">("private");

  useEffect(() => {
    if (section !== "club" || !isClubAdmin || healthLoaded) return;
    setHealthLoaded(true);
    void communityHealth()
      .then((r) => setLastActiveById(Object.fromEntries(r.members.filter((m) => m.lastActive != null).map((m) => [m.id, m.lastActive as number]))))
      .catch(() => undefined);
  }, [section, isClubAdmin, healthLoaded]);

  const createClub = async (): Promise<void> => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await onCreateCommunity({ name, description: newDesc.trim() || undefined, visibility: newVisibility, invitePolicy: "admins_only" });
      await onSwitchCommunity(created.id);
      onToast(pick(language, "Club creado. ¡Vamos allá!", "Club created. Let's go!", "Club creado. Imos aló!"));
      navigate("/home");
    } catch {
      onToast(pick(language, "No se pudo crear el club.", "Couldn't create the club.", "Non se puido crear o club."));
    } finally {
      setCreating(false);
    }
  };

  const switchClub = async (id: string): Promise<void> => {
    if (id === communityId || switchingId) return;
    setSwitchingId(id);
    try {
      await onSwitchCommunity(id);
      onToast(pick(language, "Club cambiado.", "Club switched.", "Club cambiado."));
      navigate("/home");
    } catch {
      onToast(pick(language, "No se pudo cambiar de club.", "Couldn't switch club.", "Non se puido cambiar de club."));
    } finally {
      setSwitchingId(null);
    }
  };

  // Doble confirmación (1/2): diálogo de aviso; si acepta, arma el paso 2 (teclear el nombre).
  const startDelete = async (): Promise<void> => {
    const ok = await confirm({
      title: pick(language, `¿Eliminar «${communityName ?? "el club"}»?`, `Delete "${communityName ?? "the club"}"?`, `Eliminar «${communityName ?? "o club"}»?`),
      message: pick(language, "Se borran TODOS sus libros, comentarios, votos y miembros. Es irreversible.", "This erases ALL its books, comments, votes and members. It can't be undone.", "Bórranse TODOS os seus libros, comentarios, votos e membros. É irreversible."),
      confirmLabel: pick(language, "Sí, continuar", "Yes, continue", "Si, continuar"),
      danger: true
    });
    if (ok) setDeleteArmed(true);
  };
  // (2/2): solo se activa si el texto coincide con el nombre del club.
  const confirmDelete = async (): Promise<void> => {
    if (deleting || deleteText.trim() !== (communityName ?? "").trim()) return;
    setDeleting(true);
    try {
      await onDeleteCommunity(); // navega fuera al terminar
    } catch {
      onToast(pick(language, "No se pudo eliminar el club.", "Couldn't delete the club.", "Non se puido eliminar o club."));
      setDeleting(false);
    }
  };

  const [alias, setAlias] = useState(activeUser.alias);
  const [savingAlias, setSavingAlias] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

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

  if (section === null) {
    return (
      <main>
        <div className="me-page">
          <div className="section-head">
            <h2><Icon name="settings" /> {pick(language, "Ajustes", "Settings", "Axustes")}</h2>
          </div>
          <div className="settings-index">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" className="settings-index-row" onClick={() => setSection(s.key)}>
                <span className="settings-index-icon"><Icon name={s.icon} size={18} /></span>
                <span className="settings-index-text">
                  <strong>{s.label(language)}</strong>
                  <span className="hint">{s.hint(language)}</span>
                </span>
                <span className="settings-index-chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  const current = SECTIONS.find((s) => s.key === section);

  return (
    <main>
      <div className="me-page">
        <button type="button" className="settings-back" onClick={() => setSection(null)}>
          <Icon name="arrowLeft" size={14} /> {pick(language, "Ajustes", "Settings", "Axustes")}
        </button>
        {/* Notificaciones y Accesibilidad ya traen su propio título con icono
            (PushSettings/ReadingSettings) — no lo dupliques aquí. */}
        {section !== "notifications" && section !== "accessibility" ? (
          <div className="section-head">
            <h2>{current ? <Icon name={current.icon} /> : null} {current?.label(language)}</h2>
          </div>
        ) : null}

        {section === "profile" ? (
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
        ) : null}

        {section === "club" ? (
          <>
            {/* Vista rápida del club actual: nombre + accesos a editar/invitar
                (la gestión completa vive en /community). */}
            <section className="page-section club-quick">
              <div className="club-quick-head">
                <span className="club-quick-icon"><Icon name="users" size={18} /></span>
                <div className="club-quick-id">
                  <strong className="club-quick-name">{communityName ?? pick(language, "Tu club", "Your club", "O teu club")}</strong>
                  <span className="hint">{pick(language, `${communityMembers.length} ${communityMembers.length === 1 ? "miembro" : "miembros"}`, `${communityMembers.length} ${communityMembers.length === 1 ? "member" : "members"}`, `${communityMembers.length} ${communityMembers.length === 1 ? "membro" : "membros"}`)}</span>
                </div>
              </div>
              <div className="club-quick-actions">
                {isClubAdmin ? (
                  <>
                    <Link to="/community" className="btn">
                      <Icon name="settings" size={14} /> {pick(language, "Editar club", "Edit club", "Editar club")}
                    </Link>
                    <Link to="/community" className="btn">
                      <Icon name="send" size={14} /> {pick(language, "Invitar", "Invite", "Convidar")}
                    </Link>
                  </>
                ) : (
                  <Link to="/community" className="btn">
                    <Icon name="users" size={14} /> {pick(language, "Ver el club", "View the club", "Ver o club")}
                  </Link>
                )}
              </div>
            </section>

            {/* Miembros: lista clicable → perfil, con rango y (admin) actividad. */}
            {communityMembers.length > 0 ? (
              <section className="page-section">
                <div className="section-head section-head-sub">
                  <h3>{pick(language, "Miembros", "Members", "Membros")}</h3>
                </div>
                <div className="member-list">
                  {communityMembers.map((m, i) => {
                    const seen = lastActiveById[m.id];
                    return (
                      <button key={m.id} type="button" className="member-row" onClick={() => navigate(`/profile/${m.id}`)}>
                        <UserDot alias={m.alias} colorIndex={i} />
                        <span className="member-row-main">
                          <span className="member-name">{m.alias}{m.id === activeUser.id ? pick(language, " (tú)", " (you)", " (ti)") : ""}</span>
                          {seen != null ? <span className="member-seen">{pick(language, "activo", "active", "activo")} {activeAgo(seen, language)}</span> : null}
                        </span>
                        <span className={`member-role member-role-${m.role}`}>{m.role === "admin" ? pick(language, "Admin", "Admin", "Admin") : pick(language, "Miembro", "Member", "Membro")}</span>
                        <span className="member-go" aria-hidden="true">›</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Tus clubs: cambio rápido entre los clubs de los que formas parte. */}
            {myCommunities.length > 1 ? (
              <section className="page-section">
                <div className="section-head section-head-sub">
                  <h3>{pick(language, "Tus clubs", "Your clubs", "Os teus clubs")}</h3>
                </div>
                <div className="club-switch-list">
                  {myCommunities.map((c) => {
                    const current = c.community_id === communityId;
                    return (
                      <button
                        key={c.community_id}
                        type="button"
                        className={`club-switch-row${current ? " is-current" : ""}`}
                        disabled={current || switchingId != null}
                        onClick={() => void switchClub(c.community_id)}
                      >
                        <Icon name={current ? "check" : "users"} size={14} />
                        <span className="club-switch-name">{c.name}</span>
                        {current ? (
                          <span className="club-switch-tag">{pick(language, "actual", "current", "actual")}</span>
                        ) : switchingId === c.community_id ? (
                          <span className="club-switch-tag">{pick(language, "cambiando…", "switching…", "cambiando…")}</span>
                        ) : (
                          <span className="club-switch-go" aria-hidden="true">›</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="page-section">
              <button type="button" className="btn btn-primary club-create-btn" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={14} /> {pick(language, "Crear tu club", "Create your club", "Crear o teu club")}
              </button>
              <p className="hint">{pick(language, "Empieza un club nuevo e invita a tu gente.", "Start a new club and invite your people.", "Comeza un club novo e convida á túa xente.")}</p>
            </section>

            {/* Zona peligrosa: eliminar el club (solo el fundador). Doble
                confirmación: diálogo + teclear el nombre del club. */}
            {isOwner ? (
              <section className="page-section club-danger">
                <div className="section-head section-head-sub">
                  <h3 className="club-danger-title"><Icon name="trash" size={14} /> {pick(language, "Zona peligrosa", "Danger zone", "Zona perigosa")}</h3>
                </div>
                {!deleteArmed ? (
                  <>
                    <p className="hint">{pick(language, "Eliminar el club borra todos sus libros, comentarios, votos y miembros. No se puede deshacer.", "Deleting the club erases all its books, comments, votes and members. It can't be undone.", "Eliminar o club borra todos os seus libros, comentarios, votos e membros. Non se pode desfacer.")}</p>
                    <button type="button" className="btn me-logout club-danger-btn" onClick={() => void startDelete()}>
                      <Icon name="trash" size={14} /> {pick(language, "Eliminar club", "Delete club", "Eliminar club")}
                    </button>
                  </>
                ) : (
                  <div className="club-danger-confirm">
                    <label className="form-field">
                      {pick(language, `Escribe «${communityName ?? ""}» para confirmar`, `Type "${communityName ?? ""}" to confirm`, `Escribe «${communityName ?? ""}» para confirmar`)}
                      <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoFocus placeholder={communityName ?? ""} />
                    </label>
                    <div className="club-danger-confirm-actions">
                      <button type="button" className="btn" disabled={deleting} onClick={() => { setDeleteArmed(false); setDeleteText(""); }}>
                        {pick(language, "Cancelar", "Cancel", "Cancelar")}
                      </button>
                      <button type="button" className="btn club-danger-final" disabled={deleting || deleteText.trim() !== (communityName ?? "").trim()} onClick={() => void confirmDelete()}>
                        <Icon name="trash" size={14} /> {deleting ? pick(language, "Eliminando…", "Deleting…", "Eliminando…") : pick(language, "Eliminar definitivamente", "Delete permanently", "Eliminar definitivamente")}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {section === "notifications" ? <PushSettings /> : null}

        {section === "accessibility" ? <ReadingSettings /> : null}

        {section === "data" ? (
          <section className="page-section">
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
        ) : null}

        {section === "about" ? (
          <section className="page-section">
            <p className="hint">
              {pick(
                language,
                `Estado: Beta · Versión ${APP_VERSION} · Última actualización ${APP_UPDATED_AT}`,
                `Status: Beta · Version ${APP_VERSION} · Last update ${APP_UPDATED_AT}`,
                `Estado: Beta · Versión ${APP_VERSION} · Última actualización ${APP_UPDATED_AT}`
              )}
            </p>
            <div className="about-grid">
              <article className="about-card">
                <h3><Icon name="users" /> {pick(language, "Qué es Wee", "What Wee is", "Que é Wee")}</h3>
                <p>
                  {pick(language, "Somos gente que lee y quería un sitio cálido para leer en grupo y debatir los libros sin prisa. Wee es eso: un club de lectura para grupos reducidos, con ritmo compartido y debate ordenado.", "We're people who read and wanted a warm place to read together and discuss books unhurried. Wee is that: a reading club for small groups, with shared pace and tidy discussion.", "Somos xente que le e quería un sitio cálido para ler en grupo e debater os libros sen présa. Wee é iso: un club de lectura para grupos reducidos, con ritmo compartido.")}
                </p>
              </article>

              <article className="about-card">
                <h3><Icon name="target" /> {pick(language, "Cómo funciona", "How it works", "Como funciona")}</h3>
                <p>
                  {pick(language, "Proponéis libros y el club vota. El aprobado pasa a lectura: seguís los capítulos, dejáis notas y debatís en hilos. Cuando todos terminan, queda en 'leídos'.", "You propose books and the club votes. The approved one starts reading: track chapters, leave notes and discuss in threads. When everyone finishes, it moves to 'read'.", "Propoñedes libros e o club vota. O aprobado pasa a lectura: seguides os capítulos, deixades notas e debatides en fíos. Cando todos rematan, queda en 'lidos'.")}
                </p>
              </article>

              <article className="about-card">
                <h3><Icon name="heart" /> {pick(language, "Comunidad, sin ruido", "Community, no noise", "Comunidade, sen ruído")}</h3>
                <p>
                  {pick(language, "Sin monetización, sin rankings de velocidad ni rachas. Notas anti-spoiler, ritmo sano y debate cuidado. La lectura es un placer compartido, no una competición.", "No monetization, no speed rankings or streaks. Anti-spoiler notes, healthy pace and tidy debate. Reading is a shared pleasure, not a competition.", "Sen monetización, sen rankings de velocidade nin rachas. Notas anti-spoiler, ritmo san e debate coidado.")}
                </p>
              </article>

              <article className="about-card">
                <h3><Icon name="download" /> {pick(language, "Instálala en tu móvil", "Install it on your phone", "Instálaa no teu móbil")}</h3>
                <p>
                  {canInstall
                    ? pick(language, "Pulsa “Instalar app” aquí abajo y la tendrás como una app más, sin tiendas.", "Tap “Install app” below and you'll have it like any other app, no stores.", "Preme “Instalar app” aquí abaixo e terala como unha app máis, sen tendas.")
                    : pick(language, "En Android: menú del navegador → “Instalar app / Añadir a pantalla de inicio”. En iPhone (Safari): Compartir → “Añadir a pantalla de inicio”.", "On Android: browser menu → “Install app / Add to Home screen”. On iPhone (Safari): Share → “Add to Home Screen”.", "En Android: menú do navegador → “Instalar app”. En iPhone (Safari): Compartir → “Engadir á pantalla de inicio”.")}
                </p>
                {canInstall ? (
                  <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
                    <Icon name="download" size={14} /> {pick(language, "Instalar app", "Install app", "Instalar app")}
                  </button>
                ) : null}
              </article>
            </div>
          </section>
        ) : null}

        {section === "session" ? (
          <section className="page-section">
            <button type="button" className="btn me-logout" onClick={onLogout}>
              <Icon name="logout" size={14} /> {pick(language, "Cerrar sesión", "Log out", "Pechar sesión")}
            </button>
          </section>
        ) : null}
      </div>

      {/* Modal crear club: portal a <body> (si no, PageTransition lo recorta). */}
      {createOpen ? createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => (creating ? undefined : setCreateOpen(false))}>
          <div className="modal-card modal-card-compact" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{pick(language, "Crea tu club", "Create your club", "Crea o teu club")}</h2>
                <p>{pick(language, "Un espacio nuevo para leer en grupo. Luego invitas a tu gente.", "A fresh space to read together. Invite your people next.", "Un espazo novo para ler en grupo. Logo convidas á túa xente.")}</p>
              </div>
              <button type="button" className="btn btn-icon-compact" onClick={() => setCreateOpen(false)} disabled={creating} aria-label={pick(language, "Cerrar", "Close", "Pechar")}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="stack">
              <label className="form-field">{pick(language, "Nombre del club", "Club name", "Nome do club")}
                <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder={pick(language, "p. ej. Club de los martes", "e.g. Tuesday Book Club", "p. ex. Club dos martes")} autoFocus />
              </label>
              <label className="form-field">{pick(language, "Descripción (opcional)", "Description (optional)", "Descrición (opcional)")}
                <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} maxLength={200} />
              </label>
              <label className="form-field">{pick(language, "Quién puede entrar", "Who can join", "Quen pode entrar")}
                <select value={newVisibility} onChange={(e) => setNewVisibility(e.target.value as "public" | "private" | "invite")}>
                  <option value="private">{pick(language, "Privado — piden entrada", "Private — people request to join", "Privado — piden entrada")}</option>
                  <option value="invite">{pick(language, "Cerrado — solo con código", "Invite-only — code required", "Pechado — só con código")}</option>
                  <option value="public">{pick(language, "Público — cualquiera con el enlace", "Public — anyone with the link", "Público — calquera coa ligazón")}</option>
                </select>
              </label>
              <button type="button" className="btn btn-primary" disabled={creating || !newName.trim()} onClick={() => void createClub()}>
                <Icon name="check" size={14} /> {creating ? pick(language, "Creando…", "Creating…", "Creando…") : pick(language, "Crear y entrar", "Create and enter", "Crear e entrar")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </main>
  );
};
