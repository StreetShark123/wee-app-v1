import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import type { CommunitySelection } from "../lib/communitySession";
import { parseCommunityJoinInput } from "../lib/communityNavigation";

interface JoinPageProps {
  isLoggedIn: boolean;
  onPreviewCommunity: (input: { code?: string; token?: string }) => Promise<CommunitySelection>;
  onJoinCommunity: (input: { code?: string; token?: string }) => Promise<CommunitySelection>;
  onEnterCommunity: (communityId: string) => Promise<void>;
  onReloadCommunities: () => Promise<void>;
}

export const JoinPage = ({ isLoggedIn, onPreviewCommunity, onJoinCommunity, onEnterCommunity, onReloadCommunities }: JoinPageProps) => {
  const { language } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [joinInput, setJoinInput] = useState("");
  const [preview, setPreview] = useState<CommunitySelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [joining, setJoining] = useState(false);

  // ¿Llegamos por un enlace de invitación? Preservamos si vino como ?code= o ?invite=
  // (token) en lugar de re-adivinar por longitud (un código largo se tomaba por token).
  const inviteParsed = useMemo<{ code?: string; token?: string }>(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("invite")?.trim();
    if (token) return { token };
    const code = params.get("code")?.trim();
    if (code) return { code: code.toUpperCase() };
    return {};
  }, [location.search]);
  const inviteFromUrl = inviteParsed.token ?? inviteParsed.code ?? "";
  const cameByLink = Boolean(inviteFromUrl);

  useEffect(() => {
    if (inviteFromUrl) setJoinInput(inviteFromUrl);
  }, [inviteFromUrl]);

  useEffect(() => {
    if (!inviteParsed.code && !inviteParsed.token) return;
    setLoadingPreview(true);
    setError(null);
    void onPreviewCommunity(inviteParsed)
      .then((data) => setPreview(data))
      .catch(() => {
        setPreview(null);
        setError(
          pick(
            language,
            "No encontramos ese club o la invitación ya no vale.",
            "We couldn't find that community, or the invite is no longer valid.",
            "Non atopamos esa comunidade ou a invitación xa non vale."
          )
        );
      })
      .finally(() => setLoadingPreview(false));
  }, [language, inviteParsed, onPreviewCommunity]);

  const submitPreview = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = parseCommunityJoinInput(joinInput);
    if (!parsed.code && !parsed.token) {
      setError(pick(language, "Pega un código válido para continuar.", "Paste a valid code to continue.", "Pega un código válido para continuar."));
      return;
    }
    setLoadingPreview(true);
    try {
      const data = await onPreviewCommunity(parsed);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : pick(language, "No encontramos ese club. Revisa el código.", "We couldn't find that community. Check the code.", "Non atopamos esa comunidade. Revisa o código."));
    } finally {
      setLoadingPreview(false);
    }
  };

  const confirmJoin = async () => {
    if (!preview || joining || !isLoggedIn) return;
    setError(null);
    setJoining(true);
    try {
      const parsed = parseCommunityJoinInput(joinInput);
      const joined = await onJoinCommunity(parsed);
      await onReloadCommunities();
      await onEnterCommunity(joined.id);
      navigate("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : pick(language, "No pudimos unirte ahora. Prueba otra vez.", "Could not join right now. Please try again.", "Non puidemos unirte agora. Proba outra vez."));
    } finally {
      setJoining(false);
    }
  };

  // ─── Vista de invitación (llegaste por enlace): clara y de dos botones ──────────
  if (cameByLink) {
    return (
      <main className="page-section narrow invite-screen">
        {loadingPreview && !preview ? (
          <p className="hint invite-loading">
            {pick(language, "Buscando tu invitación", "Looking up your invite", "Buscando a túa invitación")}
            <span className="loading-dots" aria-hidden="true" />
          </p>
        ) : preview ? (
          <article className="invite-hero">
            <span className="invite-eyebrow">{pick(language, "Te han invitado a", "You've been invited to", "Convidáronte a")}</span>
            <h1 className="invite-club-name">{preview.name}</h1>
            {preview.description ? <p className="invite-club-desc">{preview.description}</p> : null}

            {isLoggedIn ? (
              <button type="button" className="btn btn-primary invite-cta" onClick={() => void confirmJoin()} disabled={joining}>
                <Icon name="check" /> {joining ? (
                  <>
                    {pick(language, "Entrando", "Joining", "Entrando")}
                    <span className="loading-dots" aria-hidden="true" />
                  </>
                ) : pick(language, `Unirme a ${preview.name}`, `Join ${preview.name}`, `Unirme a ${preview.name}`)}
              </button>
            ) : (
              <div className="invite-choice">
                <button type="button" className="btn btn-primary invite-cta" onClick={() => navigate(`/login${location.search}`)}>
                  <Icon name="user" /> {pick(language, "Ya tengo cuenta", "I already have an account", "Xa teño conta")}
                </button>
                <button type="button" className="btn invite-cta" onClick={() => navigate(`/signup${location.search}`)}>
                  <Icon name="plus" /> {pick(language, "Crear cuenta nueva", "Create a new account", "Crear conta nova")}
                </button>
              </div>
            )}
          </article>
        ) : (
          <article className="invite-hero">
            <h1 className="invite-club-name">{pick(language, "Invitación no válida", "Invalid invite", "Invitación non válida")}</h1>
            <p className="invite-club-desc">{error}</p>
            <button type="button" className="btn" onClick={() => navigate("/communities")}>
              <Icon name="arrowLeft" /> {pick(language, "Ir a mis clubs", "Go to my clubs", "Ir aos meus clubs")}
            </button>
          </article>
        )}
      </main>
    );
  }

  // ─── Entrada manual del código (entraste a /join sin enlace) ────────────────────
  return (
    <main className="page-section narrow">
      <div className="section-head">
        <h2><Icon name="link" /> {pick(language, "Unirme a un club", "Join with code", "Unirme con código")}</h2>
      </div>
      <p className="section-intro">{pick(language, "Pega el código de invitación del club.", "Paste the club's invite code.", "Pega o código de invitación do club.")}</p>

      <form className="stack" onSubmit={submitPreview}>
        <label className="form-field">
          {pick(language, "Código del club", "Community code", "Código de comunidade")}
          <input value={joinInput} onChange={(event) => setJoinInput(event.target.value)} autoFocus />
        </label>
        <div className="auth-entry-actions">
          <button type="submit" className="btn btn-primary" disabled={loadingPreview}>
            <Icon name="eye" /> {loadingPreview ? (
              <>
                {pick(language, "Mirando", "Checking", "Mirando")}
                <span className="loading-dots" aria-hidden="true" />
              </>
            ) : pick(language, "Ver el club", "See community", "Ver comunidade")}
          </button>
          <button type="button" className="btn" onClick={() => navigate("/communities")}>
            <Icon name="arrowLeft" /> {pick(language, "Volver", "Back", "Volver")}
          </button>
        </div>
      </form>

      {preview ? (
        <article className="invite-preview-card">
          <h3>{preview.name}</h3>
          {preview.description ? <p className="hint">{preview.description}</p> : null}
          {isLoggedIn ? (
            <button type="button" className="btn btn-primary" onClick={() => void confirmJoin()} disabled={joining}>
              <Icon name="check" /> {joining ? (
                <>
                  {pick(language, "Entrando", "Entering", "Entrando")}
                  <span className="loading-dots" aria-hidden="true" />
                </>
              ) : pick(language, "Confirmar y entrar", "Confirm and enter", "Confirmar e entrar")}
            </button>
          ) : (
            <div className="auth-entry-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/login${location.search}`)}>
                <Icon name="user" /> {pick(language, "Ya tengo cuenta", "I have an account", "Xa teño conta")}
              </button>
              <button type="button" className="btn" onClick={() => navigate(`/signup${location.search}`)}>
                <Icon name="plus" /> {pick(language, "Crear cuenta nueva", "Create account", "Crear conta nova")}
              </button>
            </div>
          )}
        </article>
      ) : null}

      {error ? <p className="error join-error">{error}</p> : null}
    </main>
  );
};
