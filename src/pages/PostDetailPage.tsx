import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CommentsPanel } from "../components/CommentsPanel";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { pick, translateRationale, useI18n } from "../lib/i18n";
import {
  displayTitle,
  extractNewsDate,
  formatTopicLabel,
  formatAuraScore,
  formatNewsDate,
  previewImage,
  sourceLabel,
  topicIntro
} from "../lib/presentation";
import { topicColorVars } from "../lib/topicColors";
import type { Post, User } from "../lib/types";

interface PostDetailPageProps {
  activeUser: User;
  users: User[];
  posts: Post[];
  onOpenShareModal?: () => void;
  onLogout: () => void;
  activeUserId: string | null;
  onOpenExternalSource: (postId: string) => Promise<void>;
  onRatePost: (postId: string, vote: 1 | -1) => Promise<{ ok: boolean; message: string }>;
  onAddComment: (postId: string, text: string) => Promise<{ ok: boolean; message: string; post?: Post }>;
  onVoteCommentAura: (postId: string, commentId: string) => Promise<{ ok: boolean; message: string; post?: Post }>;
  onAdminDeleteComment: (postId: string, commentId: string) => Promise<{ ok: boolean; message: string }>;
  onAdminDeletePost: (postId: string) => Promise<{ ok: boolean; message: string }>;
  onAdminUpdatePostTopic: (postId: string, nextTopic: string) => Promise<{ ok: boolean; message: string }>;
  onAddPostTopic: (postId: string, nextTopic: string) => Promise<{ ok: boolean; message: string }>;
  onReportPost: (postId: string, reason: string) => Promise<{ ok: boolean; message: string }>;
  onAdminModeratePost: (
    postId: string,
    status: "active" | "collapsed" | "removed",
    reason: string
  ) => Promise<{ ok: boolean; message: string }>;
  onToast: (message: string) => void;
}

const relatedScore = (base: Post, candidate: Post): number => {
  if (base.id === candidate.id) return -Infinity;
  const sharedTopics = candidate.topics.filter((topic) => base.topics.includes(topic)).length;
  const ageHours = Math.max(0, (Date.now() - candidate.createdAt) / (1000 * 60 * 60));
  const recency = ageHours < 24 ? 10 : ageHours < 72 ? 6 : 2;
  return sharedTopics * 15 + candidate.qualityScore * 0.4 + candidate.interestScore * 0.3 + recency;
};

export const PostDetailPage = ({
  activeUser,
  users,
  posts,
  onOpenShareModal,
  onLogout,
  activeUserId,
  onOpenExternalSource,
  onRatePost,
  onAddComment,
  onVoteCommentAura,
  onAdminDeleteComment,
  onAdminDeletePost,
  onAdminUpdatePostTopic,
  onAddPostTopic,
  onReportPost,
  onAdminModeratePost,
  onToast
}: PostDetailPageProps) => {
  const { language } = useI18n();
  const { postId = "" } = useParams();
  const navigate = useNavigate();
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const postFromState = useMemo(() => posts.find((post) => post.id === postId) ?? null, [posts, postId]);
  const [current, setCurrent] = useState<Post | null>(postFromState);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [showSourceVoteHint, setShowSourceVoteHint] = useState(false);
  const [sourceOpenedSession, setSourceOpenedSession] = useState(false);
  const [auraOpen, setAuraOpen] = useState(false);
  const [thumbUpPulse, setThumbUpPulse] = useState(false);
  const [manualTopic, setManualTopic] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [adminTopic, setAdminTopic] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const settingsRef = useRef<HTMLDetailsElement | null>(null);
  const isAdmin = activeUser.role === "admin";

  useEffect(() => {
    setCurrent(postFromState);
    setShowSourceVoteHint(false);
    setSourceOpenedSession(false);
    setAuraOpen(false);
    setThumbUpPulse(false);
    setManualTopic("");
    setAdminTopic(postFromState?.topics?.[0] ?? "");
    setReportReason("");
    setModerationReason("");
  }, [postFromState]);

  useEffect(() => {
    if (!current?.id || !activeUserId) {
      setSourceOpenedSession(false);
      return;
    }
    try {
      const key = `wee:source-opened:${activeUserId}:${current.id}`;
      setSourceOpenedSession(window.sessionStorage.getItem(key) === "1");
    } catch {
      setSourceOpenedSession(false);
    }
  }, [activeUserId, current?.id]);

  useEffect(() => {
    const onDocPointerDown = (event: MouseEvent) => {
      const details = settingsRef.current;
      if (!details?.open) return;
      if (details.contains(event.target as Node)) return;
      details.open = false;
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const details = settingsRef.current;
      if (!details?.open) return;
      details.open = false;
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const related = useMemo(() => {
    if (!current) return [];
    return [...posts]
      .sort((a, b) => relatedScore(current, b) - relatedScore(current, a))
      .slice(0, 6);
  }, [current, posts]);

  const currentUserVote = useMemo(() => {
    if (!current || !activeUserId) return null;
    return current.feedbacks?.find((item) => item.userId === activeUserId)?.vote ?? null;
  }, [current, activeUserId]);

  const canRate = useMemo(() => {
    if (!current || !activeUserId) return false;
    return (current.openedByUserIds ?? []).includes(activeUserId) || sourceOpenedSession;
  }, [current, activeUserId, sourceOpenedSession]);
  const author = current ? usersById.get(current.userId) : undefined;
  const coverImage = current ? previewImage(current) : null;
  const auraDelta = current ? (current.feedbacks ?? []).reduce((acc, item) => acc + item.vote, 0) : 0;
  const auraTrend = auraDelta > 0 ? "up" : auraDelta < 0 ? "down" : "flat";
  const auraArrow = auraTrend === "up" ? "▲" : auraTrend === "down" ? "▼" : "•";
  const auraWhy = current?.rationale.slice(0, 4) ?? [];

  if (!current) {
    return (
      <main>
        <TopBar user={activeUser} onOpenShare={onOpenShareModal} onLogout={onLogout} />
        <section className="page-section narrow">
          <h2>{pick(language, "No encontramos este libro", "We can't find this post", "Non atopamos esta nova")}</h2>
          <p className="hint">{pick(language, "Puede que se haya eliminado o fusionado con un duplicado.", "It may have been removed or merged as duplicate.", "Pode que se eliminase ou fusionase cun duplicado.")}</p>
          <Link to="/home" className="btn"><Icon name="arrowLeft" /> {pick(language, "Volver al inicio", "Back home", "Volver ao inicio")}</Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenShareModal} onLogout={onLogout} />

      <section className="page-section detail-layout">
        <article className="detail-main">
          <div className="section-head">
            <h2>{displayTitle(current)}</h2>
            <div className="detail-head-actions page-head-actions">
              {current.url ? <span className="badge">{sourceLabel(current)}</span> : null}
              <button type="button" className="btn btn-nav" onClick={() => navigate(-1)}>
                <Icon name="arrowLeft" /> {pick(language, "Volver", "Back", "Volver")}
              </button>
              <details className="detail-settings-menu" ref={settingsRef}>
                <summary className="btn btn-nav">
                  <Icon name="settings" /> {pick(language, "Ajustes", "Settings", "Axustes")}
                </summary>
                <div className="detail-settings-panel">
                  <div className="detail-settings-head">
                    <h3>{pick(language, "Ajustes rápidos", "Quick settings", "Axustes rápidos")}</h3>
                    <button
                      type="button"
                      className="btn btn-nav detail-settings-close"
                      onClick={() => {
                        if (settingsRef.current) settingsRef.current.open = false;
                      }}
                    >
                      {pick(language, "Cerrar", "Close", "Pechar")}
                    </button>
                  </div>
                  <div className="detail-actions detail-actions-compact">
                    <div className="detail-inline-action">
                      <input
                        value={manualTopic}
                        onChange={(event) => setManualTopic(event.target.value)}
                        placeholder={pick(language, "Ejemplo: novela negra", "Example: energy", "Exemplo: enerxia")}
                      />
                      <button
                        type="button"
                        className="btn detail-inline-icon-btn"
                        disabled={!manualTopic.trim() || topicBusy}
                        title={pick(language, "Añadir tema", "Add topic", "Engadir tema")}
                        aria-label={pick(language, "Añadir tema", "Add topic", "Engadir tema")}
                        onClick={async () => {
                          setTopicBusy(true);
                          const result = await onAddPostTopic(current.id, manualTopic);
                          onToast(result.message);
                          if (result.ok) {
                            const nextTopic = manualTopic
                              .trim()
                              .toLowerCase()
                              .replace(/\s+/g, "-")
                              .replace(/[^a-z0-9-]/g, "")
                              .slice(0, 36);
                            setCurrent((prev) => {
                              if (!prev || prev.topics.includes(nextTopic)) return prev;
                              return { ...prev, topics: [nextTopic, ...prev.topics].slice(0, 6) };
                            });
                            setManualTopic("");
                          }
                          setTopicBusy(false);
                        }}
                      >
                        <Icon name="plus" />
                      </button>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="detail-settings-admin">
                      <details className="detail-subsection">
                        <summary>{pick(language, "Moderación admin", "Admin moderation", "Moderación admin")}</summary>
                        <div className="detail-actions detail-actions-compact">
                          <div className="detail-inline-action">
                            <input
                              value={adminTopic}
                              onChange={(event) => setAdminTopic(event.target.value)}
                              placeholder={pick(language, "Nuevo tema", "New topic", "Novo tema")}
                            />
                            <button
                              type="button"
                              className="btn detail-inline-icon-btn"
                              title={pick(language, "Cambiar tema", "Change topic", "Cambiar tema")}
                              aria-label={pick(language, "Cambiar tema", "Change topic", "Cambiar tema")}
                              onClick={async () => {
                                const result = await onAdminUpdatePostTopic(current.id, adminTopic);
                                onToast(result.message);
                              }}
                            >
                              <Icon name="pencil" />
                            </button>
                          </div>
                          <input
                            value={moderationReason}
                            onChange={(event) => setModerationReason(event.target.value)}
                            placeholder={pick(language, "Motivo de moderación (opcional)", "Moderation reason (optional)", "Motivo de moderación (opcional)")}
                          />
                          <div className="detail-actions detail-actions-grid">
                            <button
                              type="button"
                              className="btn"
                              onClick={async () => {
                                const result = await onAdminModeratePost(current.id, "collapsed", moderationReason);
                                onToast(result.message);
                                if (result.ok) {
                                  setCurrent((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          status: "collapsed",
                                          removedBy: activeUser.id,
                                          removedAt: Date.now(),
                                          removedReason: moderationReason.trim() || undefined
                                        }
                                      : prev
                                  );
                                }
                              }}
                            >
                              {pick(language, "Colapsar", "Collapse", "Colapsar")}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={async () => {
                                const result = await onAdminModeratePost(current.id, "removed", moderationReason);
                                onToast(result.message);
                                if (result.ok) navigate("/home");
                              }}
                            >
                              {pick(language, "Retirar", "Remove", "Retirar")}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={async () => {
                                const result = await onAdminModeratePost(current.id, "active", "");
                                onToast(result.message);
                                if (result.ok) {
                                  setCurrent((prev) =>
                                    prev
                                      ? { ...prev, status: "active", removedBy: undefined, removedAt: undefined, removedReason: undefined }
                                      : prev
                                  );
                                }
                              }}
                            >
                              {pick(language, "Restaurar", "Restore", "Restaurar")}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={async () => {
                                const okDelete = window.confirm(pick(language, "¿Eliminar este libro?", "Delete this post?", "Eliminar esta nova?"));
                                if (!okDelete) return;
                                const result = await onAdminDeletePost(current.id);
                                onToast(result.message);
                                if (result.ok) navigate("/home");
                              }}
                            >
                              {pick(language, "Eliminar libro", "Delete post", "Eliminar nova")}
                            </button>
                          </div>
                        </div>
                      </details>
                    </div>
                  ) : null}

                  {isAdmin && current.topicExplanationV2 ? (
                    <div className="detail-settings-admin">
                      <h3>{pick(language, "Explicación de tema v2", "Topic explanation v2", "Explicación de tema v2")}</h3>
                      <p className="hint">
                        {pick(
                          language,
                          `topic_v2: ${current.topicV2 ?? "general"} · ${current.topicExplanationV2.ambiguous ? "ambiguous" : "resolved"}`,
                          `topic_v2: ${current.topicV2 ?? "general"} · ${current.topicExplanationV2.ambiguous ? "ambiguous" : "resolved"}`
                        )}
                      </p>
                      <p className="hint">
                        {pick(language, "Top candidatos", "Top candidates", "Top candidatos")}:{" "}
                        {(current.topicCandidatesV2 ?? [])
                          .slice(0, 3)
                          .map((candidate) => `${candidate.topic} (${candidate.score})`)
                          .join(" · ")}
                      </p>
                    </div>
                  ) : null}
                </div>
              </details>
            </div>
          </div>

          <div className="modal-meta">
            <span className="interest-wrap">
              <button
                type="button"
                className="badge aura-badge-btn aura-health"
                onClick={() => setAuraOpen((prev) => !prev)}
                onBlur={() => setAuraOpen(false)}
                aria-expanded={auraOpen}
              >
                {formatAuraScore(current.interestScore)} <span className={`aura-trend aura-trend-${auraTrend}`}>{auraArrow}</span>
              </button>
              <span className={auraOpen ? "interest-tooltip open" : "interest-tooltip"}>
                <strong>{pick(language, "Por qué tiene esta nota", "Why this score", "Por que ten esta nota")}</strong>
                {auraWhy.length > 0 ? (
                  <ul>
                    {auraWhy.map((line) => (
                      <li key={line}>{translateRationale(language, line)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{pick(language, "Sale de señales del club y del contexto del hilo.", "Based on community signals and thread context.", "Sae de sinais da comunidade e do contexto do fío.")}</p>
                )}
              </span>
            </span>
            <span className="badge">{formatNewsDate(extractNewsDate(current))}</span>
            {author ? <Link to={`/profile/${author.id}/posts`} className="badge">{pick(language, "Publicado por", "Posted by", "Publicado por")} {author.alias}</Link> : null}
            <span className="detail-meta-topics">
              {current.topics.map((topic) => (
                <Link key={topic} to={`/topic/${topic}`} className="chip chip-topic" style={topicColorVars(topic)}>
                  {formatTopicLabel(topic)}
                </Link>
              ))}
              {(current.subtopics ?? []).map((subtopic) => (
                <span key={subtopic} className="chip chip-subtopic">
                  {subtopic}
                </span>
              ))}
            </span>
          </div>

          {coverImage ? (
            <div className="detail-hero-image">
              <img src={coverImage} alt={displayTitle(current)} loading="lazy" />
            </div>
          ) : null}

          {current.text ? <p className="post-text">{current.text}</p> : <p className="post-text">{pick(language, "No hay sinopsis disponible.", "No summary available.", "Non hai resumo dispoñible.")}</p>}
          {!isAdmin ? (
            <div className="detail-actions">
              <input
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                placeholder={pick(language, "Motivo del reporte", "Reason for report", "Motivo do reporte")}
              />
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const result = await onReportPost(current.id, reportReason);
                  onToast(result.message);
                  if (result.ok) setReportReason("");
                }}
              >
                <Icon name="shield" /> {pick(language, "Reportar", "Report", "Reportar")}
              </button>
            </div>
          ) : null}

          <div className="detail-actions">
            {current.url ? (
              <button
                type="button"
                className="btn btn-primary source-cta"
                disabled={canRate}
                onClick={async () => {
                  if (canRate) return;
                  try {
                    const openedWindow = window.open(current.url, "_blank", "noopener,noreferrer");
                    await onOpenExternalSource(current.id);
                    setCurrent((prev) =>
                      prev
                        ? {
                            ...prev,
                            openedByUserIds: Array.from(new Set([...(prev.openedByUserIds ?? []), activeUserId ?? ""]))
                              .filter(Boolean)
                          }
                        : prev
                    );
                    setSourceOpenedSession(true);
                    setShowSourceVoteHint(false);
                    onToast(
                      openedWindow
                        ? pick(language, "Fuente abierta. Ya puedes valorar este libro.", "Source opened. You can now rate this post.", "Fonte aberta. Xa podes valorar esta nova.")
                        : pick(language, "Si no se abrió la pestaña, revisa el bloqueador. Ya puedes valorar este libro.", "If no tab opened, check your popup blocker. You can now rate this post.", "Se non se abriu a pestana, revisa o bloqueador. Xa podes valorar esta nova.")
                    );
                  } catch {
                    onToast(
                      pick(
                        language,
                        "No pudimos registrar la apertura de la fuente. Reintenta en unos segundos.",
                        "Couldn't register source opening. Try again in a few seconds.",
                        "Non puidemos rexistrar a apertura da fonte. Reintenta nuns segundos."
                      )
                    );
                  }
                }}
              >
              <Icon name="news" /> {pick(language, "Fuente", "Source", "Fonte")}
              </button>
            ) : (
              <span className="hint">{pick(language, "Este libro no tiene enlace externo.", "This post has no external URL.", "Esta nova non ten URL externa.")}</span>
            )}

            <button
              type="button"
              className={currentUserVote === 1 ? `btn btn-primary ${thumbUpPulse ? "thumb-up-pulse" : ""}` : "btn"}
              disabled={ratingBusy || !current.url}
              onClick={async () => {
                if (!activeUserId) return;
                if (!canRate) {
                  setShowSourceVoteHint(true);
                  onToast(pick(language, "Primero abre la fuente y después vota.", "Open the source first, then vote."));
                  return;
                }
                setRatingBusy(true);
                const previousFeedbacks = current.feedbacks ?? [];
                const existing = previousFeedbacks.find((item) => item.userId === activeUserId);
                const optimisticFeedbacks: NonNullable<Post["feedbacks"]> = existing
                  ? previousFeedbacks.map((item) =>
                      item.userId === activeUserId ? { ...item, vote: 1 as const, votedAt: Date.now() } : item
                    )
                  : [...previousFeedbacks, { userId: activeUserId, vote: 1 as const, votedAt: Date.now() }];
                setCurrent((prev) => (prev ? { ...prev, feedbacks: optimisticFeedbacks } : prev));
                const result = await onRatePost(current.id, 1);
                onToast(result.message);
                if (result.ok) {
                  setShowSourceVoteHint(false);
                  setThumbUpPulse(true);
                  window.setTimeout(() => setThumbUpPulse(false), 650);
                } else {
                  setCurrent((prev) => (prev ? { ...prev, feedbacks: previousFeedbacks } : prev));
                }
                setRatingBusy(false);
              }}
            >
              <Icon name="thumbUp" />
            </button>
            <button
              type="button"
              className={currentUserVote === -1 ? "btn btn-primary" : "btn"}
              disabled={ratingBusy || !current.url}
              onClick={async () => {
                if (!activeUserId) return;
                if (!canRate) {
                  setShowSourceVoteHint(true);
                  onToast(pick(language, "Primero abre la fuente y después vota.", "Open the source first, then vote."));
                  return;
                }
                setRatingBusy(true);
                const previousFeedbacks = current.feedbacks ?? [];
                const existing = previousFeedbacks.find((item) => item.userId === activeUserId);
                const optimisticFeedbacks: NonNullable<Post["feedbacks"]> = existing
                  ? previousFeedbacks.map((item) =>
                      item.userId === activeUserId ? { ...item, vote: -1 as const, votedAt: Date.now() } : item
                    )
                  : [...previousFeedbacks, { userId: activeUserId, vote: -1 as const, votedAt: Date.now() }];
                setCurrent((prev) => (prev ? { ...prev, feedbacks: optimisticFeedbacks } : prev));
                const result = await onRatePost(current.id, -1);
                onToast(result.message);
                if (result.ok) {
                  setShowSourceVoteHint(false);
                } else {
                  setCurrent((prev) => (prev ? { ...prev, feedbacks: previousFeedbacks } : prev));
                }
                setRatingBusy(false);
              }}
            >
              <Icon name="thumbDown" />
            </button>
          </div>
          {showSourceVoteHint && !canRate && current.url ? <p className="warning">{pick(language, "Visita la fuente antes de votar este libro.", "Visit the source before rating this post.", "Visita a fonte antes de votar esta nova.")}</p> : null}

          <section className="detail-comments">
            <CommentsPanel
              post={current}
              usersById={usersById}
              activeUserId={activeUserId}
              onAddComment={onAddComment}
              onVoteCommentAura={onVoteCommentAura}
              onDeleteComment={onAdminDeleteComment}
              canModerateComments={isAdmin}
              onPostUpdate={setCurrent}
              onToast={onToast}
            />
          </section>
        </article>

        <aside className="detail-side">
          <article className="detail-side-card detail-side-topic">
            <h3><Icon name="tag" /> {pick(language, "Contexto del tema", "Topic context", "Contexto do tema")}</h3>
            <p className="topic-intro">{topicIntro(current.topics, language)}</p>
            {current.topics[0] ? (
                <Link to={`/topic/${current.topics[0]}`} className="btn">
                <Icon name="timeline" /> {pick(language, "Ir al tema", "Go to topic", "Ir ao tema")}
                </Link>
            ) : null}
          </article>

          <article className="detail-side-card detail-side-timeline">
            <h3><Icon name="timeline" /> {pick(language, "Más en este hilo", "More in this thread", "Máis neste fío")}</h3>
            <div className="detail-related-list">
              {related.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="detail-related-item"
                  onClick={() => navigate(`/post/${item.id}`)}
                >
                  <span className="timeline-date">{formatNewsDate(extractNewsDate(item))}</span>
                  <strong>{displayTitle(item)}</strong>
                  <span className="detail-related-meta">
                    <span className="interest-wrap">
                      <span
                        className={`badge aura-health ${
                          item.interestScore >= 75 ? "aura-health-good" : item.interestScore >= 50 ? "aura-health-warn" : "aura-health-bad"
                        }`}
                      >
                        {pick(language, "Aura", "Aura")} {formatAuraScore(item.interestScore)}
                      </span>
                      <span className="interest-tooltip">
                        <strong>{pick(language, "Por qué este Aura", "Why this Aura", "Por que esta Aura")}</strong>
                        {item.rationale.slice(0, 3).length > 0 ? (
                          <ul>
                            {item.rationale.slice(0, 3).map((line) => (
                              <li key={line}>{translateRationale(language, line)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{pick(language, "Basado en señales del club y contexto del hilo.", "Based on community signals and thread context.", "Baseado en sinais da comunidade e contexto do fío.")}</p>
                        )}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
};
