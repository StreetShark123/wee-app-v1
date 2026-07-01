import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { colorFromString, getInitials } from "../lib/utils";
import type { CommunitySelection } from "../lib/communitySession";
import type { CommunitySlugPreview } from "../lib/communityApi";

interface ClubLandingPageProps {
  isLoggedIn: boolean;
  onPreviewBySlug: (slug: string) => Promise<CommunitySlugPreview>;
  onJoinPublic: (slug: string) => Promise<CommunitySelection>;
  onRequestJoin: (slug: string) => Promise<{ requested?: boolean; joined?: boolean }>;
  onEnterCommunity: (communityId: string) => Promise<void>;
  onReloadCommunities: () => Promise<void>;
}

// Landing pública de un club por su URL propia (#/c/<slug>).
export const ClubLandingPage = ({ isLoggedIn, onPreviewBySlug, onJoinPublic, onRequestJoin, onEnterCommunity, onReloadCommunities }: ClubLandingPageProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const { slug = "" } = useParams<{ slug: string }>();
  const [club, setClub] = useState<CommunitySlugPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    onPreviewBySlug(slug)
      .then(setClub)
      .catch((err) => setError(err instanceof Error ? err.message : pick(language, "No encontramos ese club.", "We couldn't find that club.", "Non atopamos ese club.")))
      .finally(() => setLoading(false));
  }, [slug, language, onPreviewBySlug]);

  const join = async () => {
    if (!club || joining || !isLoggedIn) return;
    setJoining(true);
    setError(null);
    try {
      const joined = await onJoinPublic(club.slug);
      await onReloadCommunities();
      await onEnterCommunity(joined.id);
      navigate("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : pick(language, "No pudimos unirte ahora. Prueba otra vez.", "Could not join right now. Please try again.", "Non puidemos unirte agora. Proba outra vez."));
    } finally {
      setJoining(false);
    }
  };

  const requestJoin = async () => {
    if (!club || joining || !isLoggedIn) return;
    setJoining(true);
    setError(null);
    try {
      const res = await onRequestJoin(club.slug);
      if (res.joined) {
        await onReloadCommunities();
        navigate("/home");
        return;
      }
      setRequested(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : pick(language, "No pudimos enviar la solicitud. Prueba otra vez.", "Could not send the request. Please try again.", "Non puidemos enviar a solicitude. Proba outra vez."));
    } finally {
      setJoining(false);
    }
  };

  const memberLabel = club
    ? pick(
        language,
        `${club.memberCount} ${club.memberCount === 1 ? "miembro" : "miembros"}`,
        `${club.memberCount} member${club.memberCount === 1 ? "" : "s"}`,
        `${club.memberCount} ${club.memberCount === 1 ? "membro" : "membros"}`
      )
    : "";

  return (
    <main className="page-section narrow invite-screen">
      {loading && !club ? (
        <p className="hint invite-loading">
          {pick(language, "Buscando el club", "Looking up the club", "Buscando o club")}
          <span className="loading-dots" aria-hidden="true" />
        </p>
      ) : club ? (
        <article className="invite-hero">
          <span className="invite-eyebrow">{pick(language, "Club de lectura", "Reading club", "Club de lectura")}</span>
          <h1 className="invite-club-name">{club.name}</h1>
          {club.description ? <p className="invite-club-desc">{club.description}</p> : null}
          {club.members && club.members.length > 1 ? (
            <div className="landing-avatars" aria-hidden="true">
              {club.members.slice(0, 6).map((m, i) =>
                m.avatar_url ? (
                  <img key={i} src={m.avatar_url} alt="" width={40} height={40} className="avatar landing-avatar" />
                ) : (
                  <span key={i} className="avatar avatar-fallback landing-avatar" style={{ background: colorFromString(m.alias) }}>
                    {getInitials(m.alias)}
                  </span>
                )
              )}
              {club.memberCount > 6 ? <span className="avatar avatar-fallback landing-avatar landing-avatar-more">+{club.memberCount - 6}</span> : null}
            </div>
          ) : null}
          <p className="hint">{memberLabel}</p>
          {club.visibility === "public" ? (
            isLoggedIn ? (
              <button type="button" className="btn btn-primary invite-cta" onClick={() => void join()} disabled={joining}>
                <Icon name="check" /> {joining
                  ? pick(language, "Entrando", "Joining", "Entrando")
                  : pick(language, `Unirme a ${club.name}`, `Join ${club.name}`, `Unirme a ${club.name}`)}
              </button>
            ) : (
              <div className="invite-choice">
                <button type="button" className="btn btn-primary invite-cta" onClick={() => navigate(`/login?club=${encodeURIComponent(club.slug)}`)}>
                  <Icon name="user" /> {pick(language, "Ya tengo cuenta", "I have an account", "Xa teño conta")}
                </button>
                <button type="button" className="btn invite-cta" onClick={() => navigate(`/signup?club=${encodeURIComponent(club.slug)}`)}>
                  <Icon name="plus" /> {pick(language, "Crear cuenta", "Create account", "Crear conta")}
                </button>
              </div>
            )
          ) : club.visibility === "private" ? (
            requested ? (
              <p className="hint invite-requested">
                <Icon name="check" /> {pick(language, "Solicitud enviada. Un administrador la revisará.", "Request sent. An admin will review it.", "Solicitude enviada. Un administrador revisaraa.")}
              </p>
            ) : isLoggedIn ? (
              <button type="button" className="btn btn-primary invite-cta" onClick={() => void requestJoin()} disabled={joining}>
                <Icon name="send" /> {joining
                  ? pick(language, "Enviando", "Sending", "Enviando")
                  : pick(language, "Solicitar unirme", "Request to join", "Solicitar unirme")}
              </button>
            ) : (
              <div className="invite-choice">
                <button type="button" className="btn btn-primary invite-cta" onClick={() => navigate(`/login?club=${encodeURIComponent(club.slug)}`)}>
                  <Icon name="user" /> {pick(language, "Ya tengo cuenta", "I have an account", "Xa teño conta")}
                </button>
                <button type="button" className="btn invite-cta" onClick={() => navigate(`/signup?club=${encodeURIComponent(club.slug)}`)}>
                  <Icon name="plus" /> {pick(language, "Crear cuenta", "Create account", "Crear conta")}
                </button>
              </div>
            )
          ) : (
            <p className="hint">{pick(language, "Este club es por invitación. Pide un código a un miembro.", "This club is invite-only. Ask a member for a code.", "Este club é por invitación. Pide un código a un membro.")}</p>
          )}
          {error ? <p className="warning">{error}</p> : null}
        </article>
      ) : (
        <article className="invite-hero">
          <h1 className="invite-club-name">{pick(language, "Club no encontrado", "Club not found", "Club non atopado")}</h1>
          <p className="hint">{error}</p>
          <button type="button" className="btn invite-cta" onClick={() => navigate("/home")}>
            <Icon name="arrowLeft" /> {pick(language, "Ir a mis clubs", "Go to my clubs", "Ir aos meus clubs")}
          </button>
        </article>
      )}
    </main>
  );
};
