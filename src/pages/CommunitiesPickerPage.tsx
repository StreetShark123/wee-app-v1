import { type FormEvent, useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { CommunityLoadingScreen } from "../components/CommunityLoadingScreen";
import { Icon } from "../components/Icon";
import { PunctuationLoader } from "../components/PunctuationLoader";
import { pick, useI18n } from "../lib/i18n";
import type { CommunitySelection } from "../lib/communitySession";
import type { CommunityListItem } from "../lib/communityApi";
import { shouldAutoEnterDefaultCommunity } from "../lib/communityNavigation";

interface CommunitiesPickerPageProps {
  communities: CommunityListItem[];
  loading?: boolean;
  defaultCommunityId?: string;
  skipPicker?: boolean;
  onReload: () => Promise<void>;
  onEnterCommunity: (communityId: string) => Promise<void>;
  onCreateCommunity: (input: {
    name: string;
    description?: string;
    rulesText?: string;
    invitePolicy: "admins_only" | "members_allowed";
    visibility?: "public" | "private" | "invite";
  }) => Promise<CommunitySelection>;
  onSaveSettings: (input: { defaultCommunityId?: string | null; skipPicker?: boolean }) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const CommunitiesPickerPage = ({
  communities,
  loading = false,
  defaultCommunityId,
  skipPicker,
  onReload,
  onEnterCommunity,
  onCreateCommunity,
  onSaveSettings,
  onLogout
}: CommunitiesPickerPageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [invitePolicy, setInvitePolicy] = useState<"admins_only" | "members_allowed">("admins_only");
  const [visibility, setVisibility] = useState<"public" | "private" | "invite">("public");
  const [persistChoice, setPersistChoice] = useState(Boolean(skipPicker));
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [enteringCommunityName, setEnteringCommunityName] = useState<string | null>(null);

  useEffect(() => {
    setPersistChoice(Boolean(skipPicker));
  }, [skipPicker]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const canAutoEnter = shouldAutoEnterDefaultCommunity({
      skipPicker,
      defaultCommunityId,
      availableCommunityIds: communities.map((entry) => entry.community_id),
      hasInviteQuery: Boolean(query.get("invite"))
    });
    if (!canAutoEnter || !defaultCommunityId) return;
    void enter(defaultCommunityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipPicker, defaultCommunityId, communities, location.search]);

  useEffect(() => {
    if (selectedCommunityId && communities.some((entry) => entry.community_id === selectedCommunityId)) return;
    setSelectedCommunityId(communities[0]?.community_id ?? null);
  }, [communities, selectedCommunityId]);

  const toFriendlyError = (raw: unknown, fallbackEs: string, fallbackEn: string, fallbackGl: string) => {
    const message = raw instanceof Error ? raw.message : "";
    if (message.includes("COMMUNITY_NAME_EXISTS")) {
      return pick(language, "Ese nombre ya está pillado por otro club.", "That name is already taken by another community.", "Ese nome xa está collido por outra comunidade.");
    }
    return raw instanceof Error ? raw.message : pick(language, fallbackEs, fallbackEn, fallbackGl);
  };

  const enter = async (communityId: string) => {
    setError(null);
    setLoadingId(communityId);
    const currentCommunity = communities.find((entry) => entry.community_id === communityId);
    setEnteringCommunityName(currentCommunity?.name ?? null);
    try {
      await onEnterCommunity(communityId);
      if (persistChoice) {
        await onSaveSettings({ defaultCommunityId: communityId, skipPicker: true });
      } else {
        await onSaveSettings({ defaultCommunityId: null, skipPicker: false });
      }
      navigate("/home");
    } catch (err) {
      setError(toFriendlyError(err, "No pudimos entrar en ese club.", "Could not enter that community.", "Non puidemos entrar nesa comunidade."));
      setEnteringCommunityName(null);
    } finally {
      setLoadingId(null);
    }
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!communityName.trim() || creatingCommunity) return;
    setCreatingCommunity(true);
    setError(null);
    try {
      const created = await onCreateCommunity({
        name: communityName.trim(),
        description: communityDescription.trim() || undefined,
        invitePolicy,
        visibility,
        rulesText: undefined
      });
      await onReload();
      setSelectedCommunityId(created.id);
      await enter(created.id);
    } catch (err) {
      setError(toFriendlyError(err, "No pudimos crear el club ahora mismo.", "Could not create community right now.", "Non puidemos crear a comunidade agora mesmo."));
    } finally {
      setCreatingCommunity(false);
    }
  };

  const exitToLogin = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
      navigate("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <main className="auth-layout auth-layout-single communities-picker-layout">
      <section className="auth-card auth-card-main auth-card-access communities-picker-card">
        <div className="section-head">
          <h2><Icon name="users" /> {pick(language, "Tus clubes", "Your communities", "As túas comunidades")}</h2>
          <button type="button" className="btn" onClick={() => void exitToLogin()} disabled={loggingOut}>
            <Icon name="logout" /> {loggingOut ? pick(language, "Saliendo...", "Signing out...", "Saíndo...") : pick(language, "Cerrar sesión", "Log out", "Pechar sesión")}
          </button>
        </div>
        <p className="section-intro">
          {loading && communities.length === 0
            ? pick(language, "Cargando tus clubes...", "Loading your communities...", "Cargando as túas comunidades...")
            : communities.length > 0
            ? pick(language, "Elige a qué club de lectura quieres entrar hoy.", "Pick where you want to jump in today.", "Escolle onde queres entrar hoxe.")
            : pick(language, "Todavía no estás en ningún club. Crea uno o únete con un código y arrancamos.", "You are not in any community yet. Create one or join with a code and let's get going.", "Aínda non estás en ningunha comunidade. Crea unha ou únete cun código e arrincamos.")}
        </p>

        {loading && communities.length === 0 ? <PunctuationLoader /> : null}
        <div className="community-picker-grid">
          <AnimatePresence initial={false}>
            {communities.map((community) => {
            const isActive = selectedCommunityId === community.community_id;
            return (
              <m.article
                key={community.community_id}
                className={`community-picker-card-item${isActive ? " is-active" : ""}`}
                onClick={() => setSelectedCommunityId(community.community_id)}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.985 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.995 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <h3>{community.name}</h3>
                <p className="hint">{pick(language, "Rol", "Role", "Rol")}: {community.role}</p>
              </m.article>
            );
            })}
          </AnimatePresence>
        </div>

        {selectedCommunityId ? (
          <label className="consent-row community-picker-default-toggle">
            <input
              type="checkbox"
              checked={persistChoice}
              onChange={(event) => setPersistChoice(event.target.checked)}
            />
            <span>{pick(language, "Entrar siempre aquí", "Always enter here", "Entrar sempre aquí")}</span>
          </label>
        ) : null}

        <div className="auth-entry-actions community-picker-actions">
          {selectedCommunityId ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void enter(selectedCommunityId)}
              disabled={loadingId === selectedCommunityId}
            >
              <Icon name="check" /> {loadingId === selectedCommunityId ? (
                <>
                  {pick(language, "Entrando", "Entering", "Entrando")}
                  <span className="loading-dots" aria-hidden="true" />
                </>
              ) : (
                pick(language, "Entrar", "Enter", "Entrar")
              )}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen((v) => !v)}>
              <Icon name="plus" /> {pick(language, "Crear club", "Create community", "Crear comunidade")}
            </button>
          )}

          {selectedCommunityId ? (
            <button type="button" className="btn" onClick={() => setCreateOpen((v) => !v)}>
              <Icon name="plus" /> {createOpen
                ? pick(language, "Cerrar creación", "Close create", "Pechar creación")
                : pick(language, "Nuevo club", "New community", "Nova comunidade")}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => navigate(`/join${location.search}`)} disabled={loading}>
            <Icon name="link" /> {pick(language, "Unirme por código", "Join with code", "Unirme con código")}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {createOpen ? (
            <m.form
              key="create-community-form"
              className="stack community-create-form"
              onSubmit={submitCreate}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <label className="form-field">{pick(language, "Nombre", "Name", "Nome")}<input value={communityName} onChange={(event) => setCommunityName(event.target.value)} /></label>
              <label className="form-field">{pick(language, "Descripción", "Description", "Descrición")}<input value={communityDescription} onChange={(event) => setCommunityDescription(event.target.value)} /></label>
              <label className="form-field">{pick(language, "Visibilidad", "Visibility", "Visibilidade")}
                <select value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private" | "invite")}>
                  <option value="public">{pick(language, "Público — cualquiera con el enlace entra", "Public — anyone with the link joins", "Público — calquera coa ligazón entra")}</option>
                  <option value="private">{pick(language, "Privado — hay que solicitar entrada", "Private — people request to join", "Privado — hai que solicitar entrada")}</option>
                  <option value="invite">{pick(language, "Cerrado — solo con código", "Invite-only — code required", "Pechado — só con código")}</option>
                </select>
              </label>
              <label className="form-field">{pick(language, "Invitaciones", "Invites", "Invitacións")}
                <select value={invitePolicy} onChange={(event) => setInvitePolicy(event.target.value as "admins_only" | "members_allowed")}>
                  <option value="admins_only">{pick(language, "Solo admins", "Admins only", "Só admins")}</option>
                  <option value="members_allowed">{pick(language, "Todos", "Everyone", "Todos")}</option>
                </select>
              </label>
              <button type="submit" className="btn btn-primary" disabled={creatingCommunity}>
                <Icon name="check" /> {creatingCommunity ? pick(language, "Creando...", "Creating...", "Creando...") : pick(language, "Crear y entrar", "Create and enter", "Crear e entrar")}
              </button>
            </m.form>
          ) : null}
        </AnimatePresence>

        {error ? <p className="error community-picker-error">{error}</p> : null}
      </section>
      {loadingId ? (
        <CommunityLoadingScreen finishing={false} />
      ) : null}
    </main>
  );
};
