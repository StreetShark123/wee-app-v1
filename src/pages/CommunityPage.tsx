import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import type { User } from "../lib/types";

interface CommunityPageProps {
  activeUser: User;
  selectedCommunity: { id: string; name: string; description?: string; rulesText?: string } | null;
  members: Array<{ id: string; alias: string; role: "admin" | "member" }>;
  communities: Array<{ community_id: string; name: string; role: "admin" | "member" }>;
  rulesText: string;
  onUpdateCommunity: (input: { name?: string; description?: string; rulesText?: string }) => Promise<unknown>;
  onCreateInvite: () => Promise<{ id: string; code: string; token: string; link: string }>;
  onSwitchCommunity: (communityId: string) => Promise<void>;
  onLeaveCommunity: () => Promise<void> | void;
  onLogout: () => void;
  onOpenShareModal?: () => void;
  onToast?: (message: string) => void;
}

export const CommunityPage = ({
  activeUser,
  selectedCommunity,
  members,
  communities,
  rulesText,
  onUpdateCommunity,
  onCreateInvite,
  onSwitchCommunity,
  onLeaveCommunity,
  onLogout,
  onOpenShareModal,
  onToast
}: CommunityPageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const isAdmin = activeUser.role === "admin";

  const [nameInput, setNameInput] = useState(selectedCommunity?.name ?? "");
  const [descriptionInput, setDescriptionInput] = useState(selectedCommunity?.description ?? "");
  const [rulesInput, setRulesInput] = useState(rulesText ?? "");
  const [invite, setInvite] = useState<{ code: string; token: string; link: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [switchingCommunityId, setSwitchingCommunityId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const otherCommunities = communities.filter((entry) => entry.community_id !== selectedCommunity?.id);

  useEffect(() => {
    setNameInput(selectedCommunity?.name ?? "");
    setDescriptionInput(selectedCommunity?.description ?? "");
    setIsEditingSettings(false);
  }, [selectedCommunity?.name, selectedCommunity?.description]);

  useEffect(() => {
    setRulesInput(rulesText ?? "");
  }, [rulesText]);

  const copy = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      const message = pick(language, `${label} copiado.`, `${label} copied.`, `${label} copiado.`);
      onToast?.(message);
      setCopyNotice(message);
      window.setTimeout(() => setCopyNotice(null), 1800);
    } catch {
      const message = pick(language, "No se pudo copiar. Prueba de nuevo.", "Couldn't copy it. Please try again.", "Non se puido copiar. Proba outra vez.");
      onToast?.(message);
      setCopyNotice(message);
      window.setTimeout(() => setCopyNotice(null), 1800);
    }
  };

  const saveCommunity = async () => {
    setSaving(true);
    try {
      await onUpdateCommunity({
        name: nameInput.trim(),
        description: descriptionInput.trim(),
        rulesText: rulesInput.trim()
      });
      onToast?.(pick(language, "Club actualizado.", "Community updated.", "Comunidade actualizada."));
      setIsEditingSettings(false);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se guardó. Inténtalo otra vez.", "Couldn't save. Please try again.", "Non se gardou. Inténtao outra vez."));
    } finally {
      setSaving(false);
    }
  };

  const generateInvite = async () => {
    try {
      const created = await onCreateInvite();
      setInvite({ code: created.code, token: created.token, link: created.link });
      onToast?.(pick(language, "Código listo. Compártelo con tu gente.", "Code ready. Share it with your people.", "Código listo. Compárteo coa túa xente."));
    } catch (error) {
      onToast?.(
        error instanceof Error
          ? error.message
          : pick(language, "No pudimos crear la invitación ahora mismo.", "We couldn't create the invite right now.", "Non puidemos crear a invitación agora mesmo.")
      );
    }
  };

  const shareInviteLink = async (link: string) => {
    if (!link) return;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: pick(language, "Invitación a Wee", "Wee invite", "Invitación a Wee"),
          text: pick(language, "Únete a nuestro club de lectura en Wee.", "Join our Wee community.", "Únete á nosa comunidade en Wee."),
          url: link
        });
        onToast?.(pick(language, "Invitación compartida.", "Invite shared.", "Invitación compartida."));
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
    await copy(link, pick(language, "Enlace", "Link", "Ligazón"));
  };

  const switchCommunity = async (communityId: string) => {
    if (!communityId || switchingCommunityId) return;
    setSwitchingCommunityId(communityId);
    try {
      await onSwitchCommunity(communityId);
      onToast?.(pick(language, "Club cambiado. Vamos al inicio.", "Community switched. Taking you home.", "Comunidade cambiada. Imos ao inicio."));
      navigate("/home");
    } catch (error) {
      onToast?.(
        error instanceof Error
          ? error.message
          : pick(language, "No pudimos cambiar de club.", "Could not switch community.", "Non puidemos cambiar de comunidade.")
      );
    } finally {
      setSwitchingCommunityId(null);
    }
  };

  return (
    <main>
      <TopBar
        user={activeUser}
        communityName={selectedCommunity?.name}
          onLeaveCommunity={async () => {
            await onLeaveCommunity();
          onToast?.(pick(language, "Has salido del club.", "You left the community.", "Saíches da comunidade."));
        }}
        onOpenShare={onOpenShareModal}
        onLogout={onLogout}
      />

      <section className="page-section community-page-section">
        <div className="section-head">
          <h2><Icon name="users" /> {pick(language, "El club", "Community", "Comunidade")}</h2>
          <div className="page-head-actions">
            <Link to="/home" className="btn btn-nav">
              <Icon name="home" /> {pick(language, "Inicio", "Home", "Inicio")}
            </Link>
          </div>
        </div>

        <article className="settings-card community-settings-card">
          <div className="community-settings-head">
            <h3>{pick(language, "Ajustes del club", "Community settings", "Axustes da comunidade")}</h3>
            {isAdmin ? (
              <button
                type="button"
                className={`btn btn-icon-compact community-edit-toggle${isEditingSettings ? " active" : ""}`}
                onClick={() => setIsEditingSettings((prev) => !prev)}
                title={
                  isEditingSettings
                    ? pick(language, "Salir de edición", "Exit edit mode", "Saír da edición")
                    : pick(language, "Editar ajustes", "Edit settings", "Editar axustes")
                }
              >
                <Icon name="pencil" size={14} />
              </button>
            ) : null}
          </div>
          <p className="hint">
            {pick(
              language,
              "Pon esto a punto: nombre claro del club, descripción breve y normas fáciles de seguir.",
              "Keep this tidy: clear name, short description, and easy-to-follow rules.",
              "Deixa isto a punto: nome claro, descrición breve e normas fáciles de seguir."
            )}
          </p>
          <div className="stack community-settings-form">
            <label className="form-field">
              {pick(language, "Nombre", "Name", "Nome")}
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                disabled={!isAdmin || !isEditingSettings}
              />
            </label>
            <label className="form-field">
              {pick(language, "Descripción", "Description", "Descrición")}
              <textarea
                rows={3}
                value={descriptionInput}
                onChange={(event) => setDescriptionInput(event.target.value)}
                disabled={!isAdmin || !isEditingSettings}
                placeholder={pick(
                  language,
                  "Esto lo verán antes de unirse.",
                  "People will see this before joining.",
                  "Isto verano antes de unirse."
                )}
              />
            </label>
            <label className="form-field">
              {pick(language, "Normas", "Rules", "Normas")}
              <textarea
                rows={4}
                value={rulesInput}
                onChange={(event) => setRulesInput(event.target.value)}
                disabled={!isAdmin || !isEditingSettings}
                placeholder={pick(
                  language,
                  "Visible solo para miembros. Ejemplo: respeto, cero spam, fuentes claras y sin destripar el final.",
                  "Visible to members only. Example: be respectful, no spam, share clear sources.",
                  "Visible só para membros. Exemplo: respecto, cero spam, fontes claras."
                )}
              />
            </label>
            {isAdmin && isEditingSettings ? (
              <div className="community-settings-actions">
                <button type="button" className="btn btn-nav" onClick={() => setIsEditingSettings(false)} disabled={saving}>
                  {pick(language, "Cancelar", "Cancel", "Cancelar")}
                </button>
                <button type="button" className="btn btn-primary btn-nav" onClick={saveCommunity} disabled={saving}>
                  <Icon name="check" /> {pick(language, "Guardar cambios", "Save changes", "Gardar cambios")}
                </button>
              </div>
            ) : (
              <p className="hint">
                {isAdmin
                  ? pick(language, "Pulsa el lápiz y edítalo a tu ritmo.", "Tap the pencil and edit at your pace.", "Preme no lapis e edítao ao teu ritmo.")
                  : pick(language, "Solo admins pueden editar esto.", "Only admins can edit this.", "Só admins poden editar isto.")}
              </p>
            )}
          </div>
        </article>

        <div className="settings-grid community-page-grid">
          <article className="settings-card community-switch-card">
            <h3><Icon name="spiral" /> {pick(language, "Tus clubs", "Your communities", "As túas comunidades")}</h3>
            <p className="hint">
              {selectedCommunity?.name
                ? pick(language, `Ahora mismo estás en ${selectedCommunity.name}.`, `Right now you are in ${selectedCommunity.name}.`, `Agora mesmo estás en ${selectedCommunity.name}.`)
                : pick(language, "Elige un club para seguir.", "Pick a community to continue.", "Escolle comunidade para continuar.")}
            </p>
            {otherCommunities.length === 0 ? (
              <p className="hint">{pick(language, "No tienes más clubs por ahora.", "No other communities yet.", "Aínda non tes máis comunidades.")}</p>
            ) : (
              <ul className="user-list">
                {otherCommunities.map((community) => (
                  <li key={community.community_id} className="user-option user-option-spread">
                    <span>{community.name}</span>
                    <button
                      type="button"
                      className="btn btn-nav"
                      onClick={() => void switchCommunity(community.community_id)}
                      disabled={switchingCommunityId === community.community_id}
                    >
                      <Icon name="arrowLeft" />
                      {switchingCommunityId === community.community_id
                        ? pick(language, "Entrando...", "Entering...", "Entrando...")
                        : pick(language, "Entrar", "Enter", "Entrar")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="settings-card">
            <h3><Icon name="users" /> {pick(language, "Miembros", "Members", "Membros")}</h3>
            <p className="hint">{pick(language, "Aquí ves quién está dentro y quién puede moderar.", "Here you can see who is in and who can moderate.", "Aquí ves quen está dentro e quen pode moderar.")}</p>
            {members.length === 0 ? <p className="hint">{pick(language, "Todavía no hay miembros.", "No members yet.", "Aínda non hai membros.")}</p> : null}
            <ul className="user-list">
              {members.map((member) => (
                <li key={member.id} className="user-option user-option-spread">
                  <span>{member.alias}</span>
                  {member.role === "admin" ? <span className="badge">Admin</span> : <span className="hint">{pick(language, "Miembro", "Member", "Membro")}</span>}
                </li>
              ))}
            </ul>
          </article>

          <article className="settings-card">
            <h3><Icon name="link" /> {pick(language, "Invitar gente", "Invite people", "Convidar xente")}</h3>
            <p className="hint">{pick(language, "Comparte el código y trae a tu gente al club.", "Share the code and bring your people into the thread.", "Comparte o código e trae á túa xente ao fío.")}</p>
            <div className="stack community-settings-form">
              <button type="button" className="btn btn-nav" onClick={generateInvite}>
                <Icon name="plus" /> {pick(language, "Crear invitación", "Create invite", "Crear invitación")}
              </button>
              {invite ? (
                <>
                  <div className="hint">{pick(language, "Código del club", "Community code", "Código da comunidade")}: <strong>{invite.code}</strong></div>
                  <div className="auth-entry-actions community-invite-actions">
                    <button type="button" className="btn btn-nav" onClick={() => copy(invite.code, pick(language, "Código", "Code", "Código"))}>
                      <Icon name="link" /> {pick(language, "Copiar código", "Copy code", "Copiar código")}
                    </button>
                    <button type="button" className="btn btn-nav" onClick={() => void shareInviteLink(invite.link)}>
                      <Icon name="send" /> {pick(language, "Compartir enlace", "Share link", "Compartir ligazón")}
                    </button>
                  </div>
                  {copyNotice ? (
                    <p className="copy-inline-toast" role="status" aria-live="polite">
                      <Icon name="check" size={13} /> {copyNotice}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="hint">{pick(language, "Genera un código y pásaselo a quien quieras sumar.", "Generate a code and share it with people you want to bring in.", "Xera un código e pásallo a quen queiras sumar.")}</p>
              )}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
};
