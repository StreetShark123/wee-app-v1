import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Icon, type IconName } from "../components/Icon";
import { PushSettings } from "../components/PushSettings";
import { ReadingSettings } from "../components/ReadingSettings";
import { UserDot } from "../components/UserBadge";
import { pick, useI18n } from "../lib/i18n";
import { AVATAR_MAX_PX, imageFileToDataUrl } from "../lib/imageCompress";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "../lib/usageAnalytics";
import { useInstallPrompt } from "../lib/useInstallPrompt";
import type { AppLanguage, User } from "../lib/types";

type ClubListItem = { community_id: string; name: string; description?: string; role: "admin" | "member" };

const ALPHA_VERSION = "v0.4.0-alpha";
const ALPHA_UPDATED_AT = "2026-06-27";

// Ajustes: índice tipo "Ajustes del sistema" — filas con icono que abren su
// propia sub-sección, en vez de una página larga con todo desplegado. Orden:
// tú (perfil) → el club → el resto (notificaciones/accesibilidad/datos/sesión).
// "Tú" (la otra pestaña) es SOLO biblioteca personal; quién eres vive aquí.
interface SettingsPageProps {
  activeUser: User;
  communityName?: string;
  communityId?: string;
  communityMembers: Array<{ id: string; alias: string; role: "admin" | "member" }>;
  myCommunities: ClubListItem[];
  onSwitchCommunity: (communityId: string) => Promise<unknown>;
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

export const SettingsPage = ({ activeUser, communityName, communityId, communityMembers, myCommunities, onSwitchCommunity, onUpdateAvatar, onUpdateAlias, onExport, onLogout, onToast }: SettingsPageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [section, setSection] = useState<SectionKey | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState(isAnalyticsOptedOut());
  const isClubAdmin = activeUser.role === "admin";

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
            {/* Vista rápida del club actual: nombre + vistazo de miembros +
                accesos a editar/invitar (la gestión completa vive en /community). */}
            <section className="page-section club-quick">
              <div className="club-quick-head">
                <span className="club-quick-icon"><Icon name="users" size={18} /></span>
                <div className="club-quick-id">
                  <strong className="club-quick-name">{communityName ?? pick(language, "Tu club", "Your club", "O teu club")}</strong>
                  <span className="hint">{pick(language, `${communityMembers.length} ${communityMembers.length === 1 ? "miembro" : "miembros"}`, `${communityMembers.length} ${communityMembers.length === 1 ? "member" : "members"}`, `${communityMembers.length} ${communityMembers.length === 1 ? "membro" : "membros"}`)}</span>
                </div>
              </div>

              {communityMembers.length > 0 ? (
                <button type="button" className="club-quick-members" onClick={() => navigate("/community")} aria-label={pick(language, "Ver los miembros del club", "See club members", "Ver os membros do club")}>
                  <span className="club-quick-stack">
                    {communityMembers.slice(0, 7).map((m, i) => (
                      <UserDot key={m.id} alias={m.alias} colorIndex={i} />
                    ))}
                  </span>
                  {communityMembers.length > 7 ? <span className="club-quick-more">+{communityMembers.length - 7}</span> : null}
                </button>
              ) : null}

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
              <button type="button" className="btn btn-primary club-create-btn" onClick={() => navigate("/communities")}>
                <Icon name="plus" size={14} /> {pick(language, "Crear tu club", "Create your club", "Crear o teu club")}
              </button>
              <p className="hint">{pick(language, "Empieza un club nuevo e invita a tu gente.", "Start a new club and invite your people.", "Comeza un club novo e convida á túa xente.")}</p>
            </section>
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
                `Estado: Alpha · Versión ${ALPHA_VERSION} · Última actualización ${ALPHA_UPDATED_AT}`,
                `Status: Alpha · Version ${ALPHA_VERSION} · Last update ${ALPHA_UPDATED_AT}`,
                `Estado: Alpha · Versión ${ALPHA_VERSION} · Última actualización ${ALPHA_UPDATED_AT}`
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
    </main>
  );
};
