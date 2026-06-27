import { type FormEvent, useEffect, useState } from "react";
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const invite = params.get("invite");
    const code = params.get("code");
    if (invite) setJoinInput(invite);
    else if (code) setJoinInput(code);
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const invite = params.get("invite");
    const code = params.get("code");
    const source = invite ?? code ?? "";
    if (!source) return;
    const parsed = parseCommunityJoinInput(source);
    if (!parsed.code && !parsed.token) return;
    setLoadingPreview(true);
    setError(null);
    void onPreviewCommunity(parsed)
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
  }, [language, location.search, onPreviewCommunity]);

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

  return (
    <main className="page-section narrow">
      <div className="section-head">
        <h2><Icon name="link" /> {pick(language, "Unirme a un club", "Join with code", "Unirme con código")}</h2>
      </div>
      <p className="section-intro">{pick(language, "Pega el código, revisa el club y entra en un toque.", "Paste the code, check the community, and jump in.", "Pega o código, revisa a comunidade e entra nun toque.")}</p>

      <form className="stack" onSubmit={submitPreview}>
        <label className="form-field">
          {pick(language, "Código del club", "Community code", "Código de comunidade")}
          <input value={joinInput} onChange={(event) => setJoinInput(event.target.value)} />
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
                <Icon name="check" /> {pick(language, "Entrar con mi cuenta", "Log in with my account", "Entrar coa miña conta")}
              </button>
              <button type="button" className="btn" onClick={() => navigate(`/signup${location.search}`)}>
                <Icon name="plus" /> {pick(language, "Crear cuenta", "Create account", "Crear conta")}
              </button>
            </div>
          )}
        </article>
      ) : null}

      {error ? <p className="error join-error">{error}</p> : null}
    </main>
  );
};
