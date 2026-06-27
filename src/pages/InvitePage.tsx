import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import type { CommunitySelection } from "../lib/communitySession";
import { pick, useI18n } from "../lib/i18n";
import { getInitials } from "../lib/utils";

interface InvitePageProps {
  isLoggedIn: boolean;
  onPreviewCommunity: (input: { code?: string; token?: string }) => Promise<CommunitySelection & { inviter?: { alias: string; avatar_url?: string } }>;
  onConfirmCommunity: (input: { code?: string; token?: string }) => Promise<CommunitySelection>;
  onEnterCommunity: (communityId: string) => Promise<void>;
}

export const InvitePage = ({ isLoggedIn, onPreviewCommunity, onConfirmCommunity, onEnterCommunity }: InvitePageProps) => {
  const { language } = useI18n();
  const { token = "" } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [community, setCommunity] = useState<(CommunitySelection & { inviter?: { alias: string; avatar_url?: string } }) | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setLoading(true);
        const data = await onPreviewCommunity({ token });
        if (!active) return;
        setCommunity(data);
        setError(null);
      } catch {
        if (!active) return;
        setError(
          pick(
            language,
            "No pudimos abrir esta invitación. Pide un código nuevo a quien lleva el club.",
            "We couldn't open this invite. Ask an admin for a new code.",
            "Non puidemos abrir esta invitación. Pídelle un código novo ao admin."
          )
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    if (token) void run();
    else {
      setLoading(false);
      setError(pick(language, "Falta el token de invitación.", "Invite token is missing.", "Falta o token da invitación."));
    }
    return () => {
      active = false;
    };
  }, [language, onPreviewCommunity, token]);

  const confirmAndEnter = async () => {
    if (!token || joining) return;
    setJoining(true);
    setError(null);
    try {
      const joined = await onConfirmCommunity({ token });
      await onEnterCommunity(joined.id);
      navigate("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : pick(language, "No pudimos entrar ahora mismo. Prueba otra vez.", "We couldn't enter right now. Please try again.", "Non puidemos entrar agora mesmo. Proba outra vez."));
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="auth-layout auth-layout-single">
      <section className="auth-card auth-card-main">
        {loading ? (
          <p className="hint">{pick(language, "Mirando invitación...", "Checking invite...", "Mirando invitación...")}</p>
        ) : error ? (
          <>
            <h2>{pick(language, "Invitación no disponible", "Invite unavailable", "Invitación non dispoñible")}</h2>
            <p className="error">{error}</p>
          </>
        ) : community ? (
          <>
            <h2>{pick(language, "Tienes invitación a un club de Wee", "You have a Wee invite", "Tes invitación a Wee")}</h2>
            <article className="invite-preview-card">
              <div className="invite-preview-head">
                <div className="invite-avatar">
                  {community.inviter?.avatar_url ? (
                    <img src={community.inviter.avatar_url} alt={community.inviter.alias} />
                  ) : (
                    <span>{getInitials(community.inviter?.alias ?? "W")}</span>
                  )}
                </div>
                <div>
                  <p className="invite-kicker">
                    {community.inviter?.alias
                      ? pick(language, `${community.inviter.alias} te ha invitado a su club de lectura`, `${community.inviter.alias} invited you to their community`, `${community.inviter.alias} convidoute á súa comunidade`)
                      : pick(language, "Tienes una invitación pendiente", "You have an invite waiting", "Tes unha invitación pendente")}
                  </p>
                  <h3>{community.name}</h3>
                </div>
              </div>
              {community.description ? <p className="hint">{community.description}</p> : null}
            </article>

            {!isLoggedIn ? (
              <div className="auth-entry-actions">
                <button type="button" className="btn btn-primary" onClick={() => navigate(`/login?invite=${encodeURIComponent(token)}`)}>
                  <Icon name="check" /> {pick(language, "Entrar con mi cuenta", "Log in with my account", "Entrar coa miña conta")}
                </button>
                <button type="button" className="btn" onClick={() => navigate(`/signup?invite=${encodeURIComponent(token)}`)}>
                  <Icon name="plus" /> {pick(language, "Crear cuenta", "Create account", "Crear conta")}
                </button>
              </div>
            ) : (
              <div className="stack">
                <p className="hint">{pick(language, "Ya tienes sesión iniciada. Solo confirma y entramos.", "You're already signed in. Just confirm and we'll jump in.", "Xa tes sesión iniciada. Só confirma e entramos.")}</p>
                {error ? <p className="error">{error}</p> : null}
                <button type="button" className="btn btn-primary" onClick={() => void confirmAndEnter()} disabled={joining}>
                  <Icon name="check" /> {joining ? (
                    <>
                      {pick(language, "Entrando", "Entering", "Entrando")}
                      <span className="loading-dots" aria-hidden="true" />
                    </>
                  ) : pick(language, "Confirmar y entrar", "Confirm and enter", "Confirmar e entrar")}
                </button>
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
};
