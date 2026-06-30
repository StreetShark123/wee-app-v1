import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TopBar } from "../components/TopBar";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { useConfirm } from "../lib/confirm";
import type { User } from "../lib/types";

interface CommunityPageProps {
  activeUser: User;
  selectedCommunity: { id: string; name: string; description?: string; rulesText?: string; slug?: string; visibility?: "public" | "private" | "invite" } | null;
  members: Array<{ id: string; alias: string; role: "admin" | "member" }>;
  ownerId?: string | null;
  communities: Array<{ community_id: string; name: string; role: "admin" | "member" }>;
  rulesText: string;
  onUpdateCommunity: (input: { name?: string; description?: string; rulesText?: string }) => Promise<unknown>;
  onCreateInvite: () => Promise<{ id: string; code: string; token: string; link: string }>;
  onSwitchCommunity: (communityId: string) => Promise<void>;
  onLeaveCommunity: () => Promise<void> | void;
  onSetUserRole?: (userId: string, role: "admin" | "member") => Promise<{ ok: boolean; message: string }>;
  onDeleteUser?: (userId: string) => Promise<{ ok: boolean; message: string }>;
  onRefreshMembers?: () => Promise<unknown>;
  onLogout: () => void;
  onOpenShareModal?: () => void;
  onToast?: (message: string) => void;
}

export const CommunityPage = ({
  activeUser,
  selectedCommunity,
  members,
  ownerId,
  communities,
  rulesText,
  onUpdateCommunity,
  onSwitchCommunity,
  onLeaveCommunity,
  onSetUserRole,
  onDeleteUser,
  onRefreshMembers,
  onLogout,
  onOpenShareModal,
  onToast
}: CommunityPageProps) => {
  const { language } = useI18n();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isAdmin = activeUser.role === "admin";
  const iAmOwner = !!ownerId && ownerId === activeUser.id;

  const [nameInput, setNameInput] = useState(selectedCommunity?.name ?? "");
  const [descriptionInput, setDescriptionInput] = useState(selectedCommunity?.description ?? "");
  const [rulesInput, setRulesInput] = useState(rulesText ?? "");
  const [saving, setSaving] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [switchingCommunityId, setSwitchingCommunityId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const otherCommunities = communities.filter((entry) => entry.community_id !== selectedCommunity?.id);

  // Orden: admin principal → admins → miembros.
  const rank = (m: { id: string; role: string }) => (m.id === ownerId ? 0 : m.role === "admin" ? 1 : 2);
  const sortedMembers = [...members].sort((a, b) => rank(a) - rank(b) || a.alias.localeCompare(b.alias));

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


  const shareInviteLink = async (link: string) => {
    if (!link) return;
    // El backend devuelve un enlace relativo (#/join?code=...); lo hacemos ABSOLUTO
    // para que el destinatario pueda abrirlo.
    const url = /^https?:\/\//.test(link)
      ? link
      : `${window.location.origin}/${link.replace(/^\//, "")}`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: pick(language, "Invitación a Wee", "Wee invite", "Invitación a Wee"),
          text: pick(language, "Únete a nuestro club de lectura en Wee.", "Join our Wee community.", "Únete á nosa comunidade en Wee."),
          url
        });
        onToast?.(pick(language, "Invitación compartida.", "Invite shared.", "Invitación compartida."));
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
    await copy(url, pick(language, "Enlace", "Link", "Ligazón"));
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

  const setRole = async (id: string, role: "admin" | "member") => {
    if (!onSetUserRole || busyMemberId) return;
    setBusyMemberId(id);
    try {
      const r = await onSetUserRole(id, role);
      onToast?.(r.message);
      await onRefreshMembers?.();
    } finally {
      setBusyMemberId(null);
    }
  };

  const removeMember = async (id: string, alias: string) => {
    if (!onDeleteUser || busyMemberId) return;
    const ok = await confirm({
      title: pick(language, `¿Eliminar a ${alias} del club?`, `Remove ${alias} from the club?`, `Eliminar a ${alias} do club?`),
      message: pick(language, "Es una decisión de moderación visible para el club.", "It's a moderation decision visible to the club.", "É unha decisión de moderación visible para o club."),
      confirmLabel: pick(language, "Eliminar", "Remove", "Eliminar"),
      danger: true
    });
    if (!ok) return;
    setBusyMemberId(id);
    try {
      const r = await onDeleteUser(id);
      onToast?.(r.message);
      await onRefreshMembers?.();
    } finally {
      setBusyMemberId(null);
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
              <Icon name="arrowLeft" /> {pick(language, "Estantería del club", "Club shelf", "Estantería do club")}
            </Link>
          </div>
        </div>

        {/* 1 · Ajustes del club */}
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
              <input value={nameInput} onChange={(event) => setNameInput(event.target.value)} disabled={!isAdmin || !isEditingSettings} />
            </label>
            <label className="form-field">
              {pick(language, "Descripción", "Description", "Descrición")}
              <textarea
                rows={3}
                value={descriptionInput}
                onChange={(event) => setDescriptionInput(event.target.value)}
                disabled={!isAdmin || !isEditingSettings}
                placeholder={pick(language, "Esto lo verán antes de unirse.", "People will see this before joining.", "Isto verano antes de unirse.")}
              />
            </label>
            <label className="form-field">
              {pick(language, "Normas", "Rules", "Normas")}
              <textarea
                rows={4}
                value={rulesInput}
                onChange={(event) => setRulesInput(event.target.value)}
                disabled={!isAdmin || !isEditingSettings}
                placeholder={pick(language, "Visible solo para miembros. Ejemplo: respeto, cero spam, sin destripar el final.", "Visible to members only. Example: be respectful, no spam, no spoilers.", "Visible só para membros. Exemplo: respecto, cero spam, sen spoilers.")}
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

        {/* 2 · Invitar gente — accesible y destacado */}
        <article className="settings-card community-invite-card">
          <h3><Icon name="link" /> {pick(language, "Invitar gente", "Invite people", "Convidar xente")}</h3>
          <p className="hint">{pick(language, "Comparte el enlace del club: quien lo abra puede unirse.", "Share the club link: anyone who opens it can join.", "Comparte a ligazón do club: quen a abra pode unirse.")}</p>
          <div className="stack community-settings-form">
            {selectedCommunity?.slug ? (
              <div className="invite-simple">
                <button type="button" className="invite-code-chip" onClick={() => copy(`${window.location.origin}/#/c/${selectedCommunity.slug}`, pick(language, "Enlace", "Link", "Ligazón"))} title={pick(language, "Tocar para copiar", "Tap to copy", "Tocar para copiar")}>
                  <span className="invite-code-value invite-url">/c/{selectedCommunity.slug}</span>
                  <span className="invite-code-hint"><Icon name="link" size={12} /> {pick(language, "copiar", "copy", "copiar")}</span>
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void shareInviteLink(`#/c/${selectedCommunity.slug}`)}>
                  <Icon name="send" /> {pick(language, "Enviar enlace del club", "Send club link", "Enviar ligazón do club")}
                </button>
                {copyNotice ? (
                  <p className="copy-inline-toast" role="status" aria-live="polite">
                    <Icon name="check" size={13} /> {copyNotice}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="hint">{pick(language, "Preparando el enlace del club...", "Preparing the club link...", "Preparando a ligazón do club...")}</p>
            )}
          </div>
        </article>

        {/* 3 · Miembros (con gestión) */}
        <article className="settings-card community-members-card">
          <h3><Icon name="users" /> {pick(language, "Miembros", "Members", "Membros")}</h3>
          <p className="hint">{pick(language, "Quién está dentro y quién puede moderar.", "Who's in and who can moderate.", "Quen está dentro e quen pode moderar.")}</p>
          {members.length === 0 ? <p className="hint">{pick(language, "Todavía no hay miembros.", "No members yet.", "Aínda non hai membros.")}</p> : null}
          <ul className="user-list">
            {sortedMembers.map((member) => {
              const isOwnerMember = member.id === ownerId;
              const isMe = member.id === activeUser.id;
              const busyThis = busyMemberId === member.id;
              const canPromote = isAdmin && onSetUserRole && !isMe && !isOwnerMember && member.role === "member";
              const canDemote = iAmOwner && onSetUserRole && !isMe && !isOwnerMember && member.role === "admin";
              const canRemove = onDeleteUser && !isMe && !isOwnerMember && (member.role === "member" ? isAdmin : iAmOwner);
              return (
                <li key={member.id} className="user-option member-row">
                  <span className="member-name">
                    {member.alias}
                    {isMe ? <span className="hint member-you"> · {pick(language, "tú", "you", "ti")}</span> : null}
                  </span>
                  <span className="member-meta">
                    {isOwnerMember ? (
                      <span className="badge badge-owner">{pick(language, "Admin principal", "Owner admin", "Admin principal")}</span>
                    ) : member.role === "admin" ? (
                      <span className="badge badge-admin">{pick(language, "Admin", "Admin", "Admin")}</span>
                    ) : (
                      <span className="badge badge-member">{pick(language, "Miembro", "Member", "Membro")}</span>
                    )}
                    {canPromote ? (
                      <button type="button" className="btn btn-tiny" disabled={busyThis} onClick={() => void setRole(member.id, "admin")}>
                        {pick(language, "Nombrar admin", "Make admin", "Nomear admin")}
                      </button>
                    ) : null}
                    {canDemote ? (
                      <button type="button" className="btn btn-tiny" disabled={busyThis} onClick={() => void setRole(member.id, "member")}>
                        {pick(language, "Quitar admin", "Remove admin", "Quitar admin")}
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button type="button" className="btn btn-tiny btn-tiny-danger" disabled={busyThis} onClick={() => void removeMember(member.id, member.alias)}>
                        {pick(language, "Eliminar", "Remove", "Eliminar")}
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {isAdmin && !iAmOwner ? (
            <p className="hint">{pick(language, "Para nombrar o quitar admins hace falta ser el admin principal del club.", "Promoting or removing admins is reserved for the club's owner admin.", "Para nomear ou quitar admins cómpre ser o admin principal.")}</p>
          ) : null}
        </article>

        {/* 4 · Roles y moderación + Tus clubs (al final, juntos) */}
        <div className="settings-grid community-page-grid">
          <article className="settings-card">
            <h3><Icon name="shield" /> {pick(language, "Roles y moderación", "Roles & moderation", "Roles e moderación")}</h3>
            <p className="hint">{pick(language, "Para que el poder sea transparente, lo veas como admin o como miembro:", "So power stays transparent, whether you're an admin or a member:", "Para que o poder sexa transparente, sexas admin ou membro:")}</p>
            <ul className="rules-list">
              <li>{pick(language, "Un admin puede: aprobar libros, editar el club y quitar libros. El admin principal puede además nombrar o quitar admins.", "An admin can: approve books, edit the club and remove books. The owner admin can also promote or remove admins.", "Un admin pode: aprobar libros, editar o club e quitar libros. O admin principal tamén pode nomear ou quitar admins.")}</li>
              <li>{pick(language, "Quitar a un miembro es una decisión visible para el club, no un borrado en silencio.", "Removing a member is a decision visible to the club, not a silent deletion.", "Quitar a un membro é unha decisión visible para o club, non un borrado en silencio.")}</li>
              <li>{pick(language, "Lo que un admin NO puede: no hay mensajes privados ni datos ocultos. Ve de ti lo mismo que cualquier miembro. Nadie lee nada en secreto.", "What an admin can't do: there are no private messages or hidden data. They see the same about you as any member. No one reads anything in secret.", "O que un admin NON pode: non hai mensaxes privadas nin datos ocultos. Nadie le nada en segredo.")}</li>
            </ul>
          </article>

          <article className="settings-card community-switch-card">
            <h3><Icon name="spiral" /> {pick(language, "Tus clubs", "Your clubs", "Os teus clubs")}</h3>
            <p className="hint">
              {selectedCommunity?.name
                ? pick(language, `Ahora mismo estás en ${selectedCommunity.name}.`, `Right now you are in ${selectedCommunity.name}.`, `Agora mesmo estás en ${selectedCommunity.name}.`)
                : pick(language, "Elige un club para seguir.", "Pick a club to continue.", "Escolle club para continuar.")}
            </p>
            {otherCommunities.length === 0 ? (
              <p className="hint">{pick(language, "No tienes más clubs por ahora.", "No other clubs yet.", "Aínda non tes máis clubs.")}</p>
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
            <Link to="/communities" className="btn btn-nav community-new-club">
              <Icon name="plus" /> {pick(language, "Crear o unirte a otro club", "Create or join another club", "Crear ou unirte a outro club")}
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
};
