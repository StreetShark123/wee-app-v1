import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { timeAgo } from "../lib/timeAgo";
import { Icon } from "../components/Icon";
import { WeeMark } from "../components/WeeMark";
import { pick, useI18n } from "../lib/i18n";
import { useConfirm } from "../lib/confirm";
import { listJoinRequests, decideJoinRequest, listInvites, revokeInvite, banMember, unbanMember, listBans, muteMember, listReports, resolveReport, communityHealth, type JoinRequestItem, type CommunityInvite, type CommunityBan, type CommentReport, type HealthMember } from "../lib/communityApi";
import type { User } from "../lib/types";

interface CommunityPageProps {
  activeUser: User;
  selectedCommunity: { id: string; name: string; description?: string; rulesText?: string; slug?: string; visibility?: "public" | "private" | "invite"; invitePolicy?: "admins_only" | "members_allowed"; bookPolicy?: "admins_only" | "members_allowed"; approvalMode?: "majority" | "all" } | null;
  members: Array<{ id: string; alias: string; role: "admin" | "member" }>;
  ownerId?: string | null;
  communities: Array<{ community_id: string; name: string; role: "admin" | "member" }>;
  rulesText: string;
  onUpdateCommunity: (input: { name?: string; description?: string; rulesText?: string; visibility?: "public" | "private" | "invite"; slug?: string; invitePolicy?: "admins_only" | "members_allowed"; bookPolicy?: "admins_only" | "members_allowed"; approvalMode?: "majority" | "all" }) => Promise<unknown>;
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
  onCreateInvite,
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
  const [visibilityInput, setVisibilityInput] = useState<"public" | "private" | "invite">(selectedCommunity?.visibility ?? "public");
  const [slugInput, setSlugInput] = useState(selectedCommunity?.slug ?? "");
  const [joinRequests, setJoinRequests] = useState<JoinRequestItem[]>([]);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [invites, setInvites] = useState<CommunityInvite[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [invitePolicyInput, setInvitePolicyInput] = useState<"admins_only" | "members_allowed">(selectedCommunity?.invitePolicy ?? "admins_only");
  const [bookPolicyInput, setBookPolicyInput] = useState<"admins_only" | "members_allowed">(selectedCommunity?.bookPolicy ?? "members_allowed");
  const [approvalModeInput, setApprovalModeInput] = useState<"majority" | "all">(selectedCommunity?.approvalMode ?? "majority");
  const [savingRules, setSavingRules] = useState(false);
  const [bans, setBans] = useState<CommunityBan[]>([]);
  const otherCommunities = communities.filter((entry) => entry.community_id !== selectedCommunity?.id);

  // Orden: admin principal → admins → miembros.
  const rank = (m: { id: string; role: string }) => (m.id === ownerId ? 0 : m.role === "admin" ? 1 : 2);
  const sortedMembers = [...members].sort((a, b) => rank(a) - rank(b) || a.alias.localeCompare(b.alias));

  useEffect(() => {
    setNameInput(selectedCommunity?.name ?? "");
    setDescriptionInput(selectedCommunity?.description ?? "");
    setVisibilityInput(selectedCommunity?.visibility ?? "public");
    setSlugInput(selectedCommunity?.slug ?? "");
    setInvitePolicyInput(selectedCommunity?.invitePolicy ?? "admins_only");
    setBookPolicyInput(selectedCommunity?.bookPolicy ?? "members_allowed");
    setApprovalModeInput(selectedCommunity?.approvalMode ?? "majority");
    setIsEditingSettings(false);
  }, [selectedCommunity?.name, selectedCommunity?.description, selectedCommunity?.visibility, selectedCommunity?.slug, selectedCommunity?.invitePolicy, selectedCommunity?.bookPolicy, selectedCommunity?.approvalMode]);

  // Reglas del club (solo admin): guardar quién invita / añade libros / aprobación.
  const saveRules = async () => {
    setSavingRules(true);
    try {
      await onUpdateCommunity({ invitePolicy: invitePolicyInput, bookPolicy: bookPolicyInput, approvalMode: approvalModeInput });
      onToast?.(pick(language, "Reglas actualizadas.", "Rules updated.", "Regras actualizadas."));
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se guardó. Inténtalo otra vez.", "Couldn't save. Try again.", "Non se gardou. Inténtao outra vez."));
    } finally {
      setSavingRules(false);
    }
  };

  // Baneados (solo admin).
  const loadBans = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { bans: rows } = await listBans();
      setBans(rows);
    } catch {
      setBans([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) void loadBans();
    else setBans([]);
  }, [isAdmin, selectedCommunity?.id, loadBans]);

  const banThisMember = async (userId: string, alias: string) => {
    const ok = await confirm({
      title: pick(language, `¿Banear a ${alias}?`, `Ban ${alias}?`, `Banear a ${alias}?`),
      message: pick(language, "No podrá volver a entrar aunque tenga un enlace o código.", "They won't be able to rejoin even with a link or code.", "Non poderá volver a entrar aínda que teña enlace ou código."),
      confirmLabel: pick(language, "Banear", "Ban", "Banear"),
      danger: true
    });
    if (!ok) return;
    setBusyMemberId(userId);
    try {
      await banMember(userId);
      onToast?.(pick(language, `${alias} baneado.`, `${alias} banned.`, `${alias} baneado.`));
      await onRefreshMembers?.();
      await loadBans();
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se pudo banear.", "Couldn't ban.", "Non se puido banear."));
    } finally {
      setBusyMemberId(null);
    }
  };

  const unbanThisUser = async (globalUserId: string) => {
    try {
      await unbanMember(globalUserId);
      setBans((prev) => prev.filter((b) => b.globalUserId !== globalUserId));
      onToast?.(pick(language, "Baneo retirado.", "Ban lifted.", "Baneo retirado."));
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se pudo.", "Couldn't do that.", "Non se puido."));
    }
  };

  const muteThisMember = async (userId: string, alias: string) => {
    const ok = await confirm({
      title: pick(language, `¿Silenciar a ${alias} 1 hora?`, `Mute ${alias} for 1 hour?`, `Silenciar a ${alias} 1 hora?`),
      message: pick(language, "No podrá comentar ni anotar un rato. Es un aviso, no un baneo.", "They won't be able to comment or add notes for a while. It's a warning, not a ban.", "Non poderá comentar nin engadir notas ese tempo. É un aviso, non un baneo."),
      confirmLabel: pick(language, "Silenciar", "Mute", "Silenciar")
    });
    if (!ok) return;
    setBusyMemberId(userId);
    try {
      await muteMember(userId, 60);
      onToast?.(pick(language, `${alias} en silencio 1 hora.`, `${alias} muted for 1 hour.`, `${alias} en silencio 1 hora.`));
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se pudo silenciar.", "Couldn't mute.", "Non se puido silenciar."));
    } finally {
      setBusyMemberId(null);
    }
  };

  // Cola de denuncias (solo admin).
  const [reports, setReports] = useState<CommentReport[]>([]);
  const loadReports = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { reports: list } = await listReports();
      setReports(list);
    } catch {
      setReports([]);
    }
  }, [isAdmin]);
  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const resolveThisReport = async (commentId: string) => {
    try {
      await resolveReport(commentId);
      setReports((prev) => prev.filter((r) => r.commentId !== commentId));
    } catch {
      /* noop */
    }
  };

  // Salud del club (solo admin): quién participa y quién se apaga.
  const [health, setHealth] = useState<HealthMember[]>([]);
  const [showHealth, setShowHealth] = useState(false);
  const loadHealth = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { members } = await communityHealth();
      setHealth(members);
    } catch {
      setHealth([]);
    }
  }, [isAdmin]);
  useEffect(() => {
    if (showHealth) void loadHealth();
  }, [showHealth, loadHealth]);
  const fadingMs = 1000 * 60 * 60 * 24 * 21; // 3 semanas sin señal = "se apaga"

  // Solicitudes de unión pendientes (solo admin, solo clubs privados).
  const loadJoinRequests = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { requests } = await listJoinRequests();
      setJoinRequests(requests);
    } catch {
      setJoinRequests([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && selectedCommunity?.visibility === "private") void loadJoinRequests();
    else setJoinRequests([]);
  }, [isAdmin, selectedCommunity?.id, selectedCommunity?.visibility, loadJoinRequests]);

  const decideRequest = async (requestId: string, approve: boolean) => {
    setBusyRequestId(requestId);
    try {
      await decideJoinRequest(requestId, approve);
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      onToast?.(approve
        ? pick(language, "Solicitud aprobada.", "Request approved.", "Solicitude aprobada.")
        : pick(language, "Solicitud rechazada.", "Request declined.", "Solicitude rexeitada."));
      if (approve) await onRefreshMembers?.();
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se pudo. Inténtalo otra vez.", "Couldn't do that. Try again.", "Non se puido. Inténtao outra vez."));
    } finally {
      setBusyRequestId(null);
    }
  };

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
      const trimmedSlug = slugInput.trim().toLowerCase();
      await onUpdateCommunity({
        name: nameInput.trim(),
        description: descriptionInput.trim(),
        rulesText: rulesInput.trim(),
        visibility: visibilityInput,
        ...(trimmedSlug && trimmedSlug !== selectedCommunity?.slug ? { slug: trimmedSlug } : {})
      });
      onToast?.(pick(language, "Club actualizado.", "Community updated.", "Comunidade actualizada."));
      setIsEditingSettings(false);
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se guardó. Inténtalo otra vez.", "Couldn't save. Please try again.", "Non se gardou. Inténtao outra vez."));
    } finally {
      setSaving(false);
    }
  };


  const loadInvites = useCallback(async () => {
    try {
      const { invites: rows } = await listInvites();
      setInvites(rows);
    } catch {
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && selectedCommunity?.visibility === "invite") void loadInvites();
    else setInvites([]);
  }, [isAdmin, selectedCommunity?.id, selectedCommunity?.visibility, loadInvites]);

  const generateCode = async () => {
    setGeneratingCode(true);
    try {
      await onCreateInvite();
      await loadInvites();
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se pudo generar el código.", "Couldn't generate the code.", "Non se puido xerar o código."));
    } finally {
      setGeneratingCode(false);
    }
  };

  const revokeCode = async (inviteId: string) => {
    try {
      await revokeInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      onToast?.(pick(language, "Código anulado.", "Code revoked.", "Código anulado."));
    } catch (error) {
      onToast?.(error instanceof Error ? error.message : pick(language, "No se pudo anular.", "Couldn't revoke.", "Non se puido anular."));
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
          title: pick(language, "Nuestro club de lectura en Wee", "Our reading club on Wee", "O noso club de lectura en Wee"),
          text: pick(language, "Lee, comparte y comenta con quien tú quieres.", "Read, share and comment with whoever you want.", "Le, comparte e comenta con quen ti queiras."),
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
            <div className="form-field">
              <span>{pick(language, "Visibilidad", "Visibility", "Visibilidade")}</span>
              <div className="visibility-options" role="radiogroup">
                {([
                  { key: "public", icon: "eye", title: pick(language, "Público", "Public", "Público"), desc: pick(language, "Cualquiera con el enlace entra directo.", "Anyone with the link joins directly.", "Calquera coa ligazón entra directo.") },
                  { key: "private", icon: "shield", title: pick(language, "Privado", "Private", "Privado"), desc: pick(language, "Visible, pero hay que pedir entrada.", "Visible, but people must request to join.", "Visible, pero hai que pedir entrada.") },
                  { key: "invite", icon: "tag", title: pick(language, "Cerrado", "Invite-only", "Pechado"), desc: pick(language, "Solo se entra con código de invitación.", "Join only with an invite code.", "Só se entra con código de invitación.") }
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={visibilityInput === opt.key}
                    className={`visibility-option${visibilityInput === opt.key ? " active" : ""}`}
                    onClick={() => setVisibilityInput(opt.key)}
                    disabled={!isAdmin || !isEditingSettings}
                  >
                    <Icon name={opt.icon} size={15} />
                    <span className="visibility-option-text">
                      <strong>{opt.title}</strong>
                      <span className="hint">{opt.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <label className="form-field">
              {pick(language, "Enlace del club", "Club link", "Ligazón do club")}
              <span className="slug-field">
                <span className="slug-prefix">/c/</span>
                <input
                  value={slugInput}
                  onChange={(event) => setSlugInput(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  disabled={!isAdmin || !isEditingSettings}
                  placeholder="mi-club"
                  spellCheck={false}
                  autoCapitalize="none"
                />
              </span>
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
          <h3><WeeMark size={20} /> {pick(language, "Invitar gente", "Invite people", "Convidar xente")}</h3>
          <p className="hint">
            {selectedCommunity?.visibility === "invite"
              ? pick(language, "Club cerrado: comparte el enlace y un código de invitación.", "Invite-only club: share the link and an invite code.", "Club pechado: comparte a ligazón e un código de invitación.")
              : selectedCommunity?.visibility === "private"
                ? pick(language, "Comparte el enlace: verán el club y podrán solicitar entrar.", "Share the link: people see the club and can request to join.", "Comparte a ligazón: verán o club e poderán solicitar entrar.")
                : pick(language, "Comparte el enlace del club: quien lo abra puede unirse.", "Share the club link: anyone who opens it can join.", "Comparte a ligazón do club: quen a abra pode unirse.")}
          </p>
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
            {selectedCommunity?.visibility === "invite" && isAdmin ? (
              <div className="invite-code-block">
                {invites.length > 0 ? (
                  <ul className="invite-code-list">
                    {invites.map((inv) => {
                      const expired = !!inv.expiresAt && Date.parse(inv.expiresAt) < Date.now();
                      return (
                        <li key={inv.id} className="invite-code-row">
                          <button type="button" className="invite-code-chip" onClick={() => copy(inv.code, pick(language, "Código", "Code", "Código"))} title={pick(language, "Tocar para copiar", "Tap to copy", "Tocar para copiar")}>
                            <span className={`invite-code-value${expired ? " is-expired" : ""}`}>{inv.code}</span>
                            <span className="invite-code-hint">
                              {expired
                                ? pick(language, "caducado", "expired", "caducado")
                                : <><Icon name="copy" size={12} /> {pick(language, "copiar", "copy", "copiar")}</>}
                            </span>
                          </button>
                          <button type="button" className="btn btn-icon-compact request-decline" onClick={() => void revokeCode(inv.id)} title={pick(language, "Anular código", "Revoke code", "Anular código")} aria-label={pick(language, "Anular código", "Revoke code", "Anular código")}>
                            <Icon name="x" size={15} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="hint">{pick(language, "Aún no hay códigos. Genera uno para invitar.", "No codes yet. Generate one to invite.", "Aínda non hai códigos. Xera un para convidar.")}</p>
                )}
                <button type="button" className="btn btn-nav" onClick={() => void generateCode()} disabled={generatingCode}>
                  <Icon name="dice" /> {pick(language, "Generar código de invitación", "Generate invite code", "Xerar código de invitación")}
                </button>
              </div>
            ) : null}
          </div>
        </article>

        {/* 2b · Solicitudes de unión (clubs privados) */}
        {isAdmin && joinRequests.length > 0 ? (
          <article className="settings-card community-requests-card">
            <h3><Icon name="user" /> {pick(language, "Solicitudes de unión", "Join requests", "Solicitudes de unión")}</h3>
            <p className="hint">{pick(language, "Gente que quiere entrar en el club. Acepta o descarta.", "People who want to join. Approve or decline.", "Xente que quere entrar no club. Acepta ou descarta.")}</p>
            <ul className="request-list">
              {joinRequests.map((reqItem) => (
                <li key={reqItem.id} className="request-row">
                  <span className="request-name">{reqItem.username}</span>
                  <span className="request-actions">
                    <button type="button" className="btn btn-icon-compact request-approve" onClick={() => void decideRequest(reqItem.id, true)} disabled={busyRequestId === reqItem.id} title={pick(language, "Aceptar", "Approve", "Aceptar")} aria-label={pick(language, `Aceptar a ${reqItem.username}`, `Approve ${reqItem.username}`, `Aceptar a ${reqItem.username}`)}>
                      <Icon name="check" size={15} />
                    </button>
                    <button type="button" className="btn btn-icon-compact request-decline" onClick={() => void decideRequest(reqItem.id, false)} disabled={busyRequestId === reqItem.id} title={pick(language, "Rechazar", "Decline", "Rexeitar")} aria-label={pick(language, `Rechazar a ${reqItem.username}`, `Decline ${reqItem.username}`, `Rexeitar a ${reqItem.username}`)}>
                      <Icon name="x" size={15} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

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
                  <Link to={`/profile/${member.id}`} className="member-name member-name-link">
                    {member.alias}
                    {isMe ? <span className="hint member-you"> · {pick(language, "tú", "you", "ti")}</span> : null}
                  </Link>
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
                    {isAdmin && !isMe && !isOwnerMember && member.role === "member" ? (
                      <>
                        <button type="button" className="btn btn-tiny" disabled={busyThis} onClick={() => void muteThisMember(member.id, member.alias)}>
                          {pick(language, "Silenciar 1h", "Mute 1h", "Silenciar 1h")}
                        </button>
                        <button type="button" className="btn btn-tiny btn-tiny-danger" disabled={busyThis} onClick={() => void banThisMember(member.id, member.alias)}>
                          {pick(language, "Banear", "Ban", "Banear")}
                        </button>
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {isAdmin && !iAmOwner ? (
            <p className="hint">{pick(language, "Para nombrar o quitar admins hace falta ser el admin principal del club.", "Promoting or removing admins is reserved for the club's owner admin.", "Para nomear ou quitar admins cómpre ser o admin principal.")}</p>
          ) : null}
          {isAdmin && reports.length > 0 ? (
            <div className="reports-block">
              <p className="hint">{pick(language, `Denuncias por revisar (${reports.length}):`, `Reports to review (${reports.length}):`, `Denuncias por revisar (${reports.length}):`)}</p>
              <ul className="request-list">
                {reports.map((r) => (
                  <li key={r.id} className="report-row">
                    <div className="report-body">
                      <span className="report-meta">{r.reporterAlias} → {r.authorAlias}{r.reason ? ` · ${r.reason}` : ""}</span>
                      <span className="report-text">{r.deleted ? pick(language, "(comentario ya borrado)", "(comment already deleted)", "(comentario xa borrado)") : `«${r.text.slice(0, 140)}»`}</span>
                    </div>
                    <span className="report-actions">
                      {r.bookId ? <Link to={`/book/${r.bookId}#c-${r.commentId}`} className="btn btn-tiny">{pick(language, "Ver", "View", "Ver")}</Link> : null}
                      <button type="button" className="btn btn-tiny" onClick={() => void resolveThisReport(r.commentId)}>
                        {pick(language, "Resolver", "Resolve", "Resolver")}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isAdmin ? (
            <div className="health-block">
              <button type="button" className="btn btn-tiny" onClick={() => setShowHealth((v) => !v)}>
                <Icon name="users" size={12} /> {showHealth ? pick(language, "Ocultar salud del club", "Hide club health", "Ocultar saúde do club") : pick(language, "Ver salud del club", "See club health", "Ver saúde do club")}
              </button>
              {showHealth ? (
                health.length === 0 ? (
                  <p className="hint">{pick(language, "Cargando…", "Loading…", "Cargando…")}</p>
                ) : (
                  <ul className="health-list">
                    {health.map((m) => {
                      const fading = m.lastActive == null || Date.now() - m.lastActive > fadingMs;
                      return (
                        <li key={m.id} className={`health-row${fading ? " is-fading" : ""}`}>
                          <span className="health-name"><Link to={`/profile/${m.id}`} className="health-name-link">{m.alias}</Link>{fading ? <span className="health-tag">{pick(language, "se apaga", "fading", "apágase")}</span> : null}</span>
                          <span className="health-stats">
                            {pick(language, `${m.votes} votos · ${m.comments} coment. · ${m.reading + m.finished} libros`, `${m.votes} votes · ${m.comments} comments · ${m.reading + m.finished} books`, `${m.votes} votos · ${m.comments} coment. · ${m.reading + m.finished} libros`)}
                            {m.lastActive ? ` · ${timeAgo(m.lastActive, language)}` : ` · ${pick(language, "sin actividad", "no activity", "sen actividade")}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}
            </div>
          ) : null}
          {bans.length > 0 ? (
            <div className="banned-block">
              <p className="hint">{pick(language, "Baneados (no pueden volver):", "Banned (can't rejoin):", "Baneados (non poden volver):")}</p>
              <ul className="request-list">
                {bans.map((b) => (
                  <li key={b.globalUserId} className="request-row">
                    <span className="request-name">{b.username}</span>
                    <button type="button" className="btn btn-tiny" onClick={() => void unbanThisUser(b.globalUserId)}>
                      {pick(language, "Quitar baneo", "Unban", "Quitar baneo")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>

        {/* 3b · Reglas del club (permisos que decide el admin) */}
        {isAdmin ? (
          <article className="settings-card community-rules-card">
            <h3><Icon name="shield" /> {pick(language, "Reglas del club", "Club rules", "Regras do club")}</h3>
            <p className="hint">{pick(language, "Quién puede hacer qué en el club.", "Who can do what in the club.", "Quen pode facer que no club.")}</p>
            <div className="stack community-settings-form">
              <label className="form-field">
                {pick(language, "Quién puede invitar gente", "Who can invite people", "Quen pode convidar xente")}
                <select value={invitePolicyInput} onChange={(e) => setInvitePolicyInput(e.target.value as "admins_only" | "members_allowed")}>
                  <option value="admins_only">{pick(language, "Solo admins", "Admins only", "Só admins")}</option>
                  <option value="members_allowed">{pick(language, "Cualquier miembro", "Any member", "Calquera membro")}</option>
                </select>
              </label>
              <label className="form-field">
                {pick(language, "Quién puede proponer libros", "Who can propose books", "Quen pode propoñer libros")}
                <select value={bookPolicyInput} onChange={(e) => setBookPolicyInput(e.target.value as "admins_only" | "members_allowed")}>
                  <option value="members_allowed">{pick(language, "Cualquier miembro", "Any member", "Calquera membro")}</option>
                  <option value="admins_only">{pick(language, "Solo admins", "Admins only", "Só admins")}</option>
                </select>
              </label>
              <label className="form-field">
                {pick(language, "Cómo se aprueba un libro", "How a book gets approved", "Como se aproba un libro")}
                <select value={approvalModeInput} onChange={(e) => setApprovalModeInput(e.target.value as "majority" | "all")}>
                  <option value="majority">{pick(language, "Por mayoría de síes", "By a majority of yes votes", "Por maioría de síes")}</option>
                  <option value="all">{pick(language, "Por unanimidad", "Unanimously", "Por unanimidade")}</option>
                </select>
              </label>
              <div className="community-settings-actions">
                <button type="button" className="btn btn-primary btn-nav" onClick={saveRules} disabled={savingRules}>
                  <Icon name="check" /> {pick(language, "Guardar reglas", "Save rules", "Gardar regras")}
                </button>
              </div>
            </div>
          </article>
        ) : null}

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
            <button
              type="button"
              className="btn btn-nav community-leave"
              onClick={async () => {
                await onLeaveCommunity();
                onToast?.(pick(language, "Has salido del club.", "You left the community.", "Saíches da comunidade."));
              }}
            >
              <Icon name="logout" /> {pick(language, "Salir de este club", "Leave this club", "Saír deste club")}
            </button>
          </article>
        </div>
      </section>
    </main>
  );
};
