import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CommentsPanel } from "./CommentsPanel";
import { EASE_STANDARD, MOTION_DURATION } from "../lib/motion";
import { pick, useI18n } from "../lib/i18n";
import { displayTitle, extractNewsDate, formatAuraScore, formatNewsDate, sourceLabel, topicIntro } from "../lib/presentation";
import type { Post, User } from "../lib/types";

interface PostDetailModalProps {
  post: Post | null;
  posts: Post[];
  users: User[];
  onClose: () => void;
  activeUserId: string | null;
  onOpenExternalSource: (postId: string) => Promise<void>;
  onRatePost: (postId: string, vote: 1 | -1) => Promise<{ ok: boolean; message: string }>;
  onAddComment: (postId: string, text: string) => Promise<{ ok: boolean; message: string; post?: Post }>;
  onVoteCommentAura: (postId: string, commentId: string) => Promise<{ ok: boolean; message: string; post?: Post }>;
  onToast: (message: string) => void;
}

const relatedScore = (base: Post, candidate: Post): number => {
  if (base.id === candidate.id) return -Infinity;
  const sharedTopics = candidate.topics.filter((topic) => base.topics.includes(topic)).length;
  const ageHours = Math.max(0, (Date.now() - candidate.createdAt) / (1000 * 60 * 60));
  const recency = ageHours < 24 ? 10 : ageHours < 72 ? 6 : 2;
  return sharedTopics * 15 + candidate.qualityScore * 0.4 + candidate.interestScore * 0.3 + recency;
};

export const PostDetailModal = ({
  post,
  posts,
  users,
  onClose,
  activeUserId,
  onOpenExternalSource,
  onRatePost,
  onAddComment,
  onVoteCommentAura,
  onToast
}: PostDetailModalProps) => {
  const { language } = useI18n();
  const [current, setCurrent] = useState<Post | null>(post);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [justOpenedExternal, setJustOpenedExternal] = useState(false);
  const [showSourceVoteHint, setShowSourceVoteHint] = useState(false);
  const [sourceOpenedSession, setSourceOpenedSession] = useState(false);

  useEffect(() => {
    setCurrent(post);
    setJustOpenedExternal(false);
    setShowSourceVoteHint(false);
    setSourceOpenedSession(false);
  }, [post]);

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

  const related = useMemo(() => {
    if (!current) return [];
    return [...posts]
      .sort((a, b) => relatedScore(current, b) - relatedScore(current, a))
      .slice(0, 5);
  }, [current, posts]);

  const currentUserVote = useMemo(() => {
    if (!current || !activeUserId) return null;
    return current.feedbacks?.find((item) => item.userId === activeUserId)?.vote ?? null;
  }, [current, activeUserId]);

  const canRate = useMemo(() => {
    if (!current || !activeUserId) return false;
    return (current.openedByUserIds ?? []).includes(activeUserId) || sourceOpenedSession;
  }, [current, activeUserId, sourceOpenedSession]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  return (
    <AnimatePresence>
      {current ? (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION_DURATION.fast, ease: EASE_STANDARD }}
          onClick={onClose}
        >
          <motion.section
            className="modal-card"
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.99 }}
            transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <h2>{displayTitle(current)}</h2>
                <p>{sourceLabel(current)} · {formatNewsDate(extractNewsDate(current))}</p>
              </div>
              <button type="button" className="btn" onClick={onClose}>
                {pick(language, "Cerrar", "Close", "Pechar")}
              </button>
            </header>

            <div className="modal-meta">
              <span className="badge">{pick(language, "Aura", "Aura", "Aura")} {formatAuraScore(current.interestScore)}</span>
              {(current.contributorUserIds?.length ?? 1) > 1 ? (
                <span className="badge">+{current.contributorUserIds?.length ?? 1} {pick(language, "colaboradores", "contributors", "colaboradores")}</span>
              ) : null}
              {current.topics.map((topic) => (
                <Link key={topic} to={`/topic/${topic}`} className="chip" onClick={onClose}>
                  {topic}
                </Link>
              ))}
              {(current.subtopics ?? []).map((subtopic) => (
                <span key={subtopic} className="chip chip-subtopic">
                  {subtopic}
                </span>
              ))}
            </div>

            <p className="topic-intro">{topicIntro(current.topics)}</p>
            {current.text ? <p className="post-text">{current.text}</p> : <p className="post-text">{pick(language, "Sin sinopsis adicional.", "No extra excerpt.", "Sen extracto adicional.")}</p>}

            <ul className="rationale">
              {current.rationale.slice(0, 4).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <div className="modal-source">
              {current.url ? (
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
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
                    window.open(current.url, "_blank", "noopener,noreferrer");
                    setJustOpenedExternal(true);
                    setShowSourceVoteHint(false);
                    onToast(pick(language, "Enlace abierto. Cuando vuelvas, valóralo si te encaja.", "Source opened. Rate it when you're back.", "Fonte aberta. Cando volvas, valóraa se che encaixa."));
                  }}
                >
                  {pick(language, "Abrir el enlace", "Open source", "Abrir fonte")}
                </button>
              ) : (
                <span className="hint">{pick(language, "No hay enlace externo para este libro.", "This post has no external URL.", "Esta nova non ten URL externa.")}</span>
              )}
            </div>

            {current.url ? (
              <section className="rating-box">
                <h3>{pick(language, "¿Te sirvió este libro?", "Was this post useful?", "Serviuche esta nova?")}</h3>
                <p className="hint">
                  {pick(language, "Tu valoración ayuda al club a ordenar mejor lo que merece la pena leer.", "Your rating helps the group prioritize useful content.", "A túa valoración axuda ao grupo a ordenar mellor o útil.")}
                </p>
                <p className="hint">{pick(language, "Para valorarlo, abre primero el enlace.", "To rate it, visit the source first.", "Para valorala, visita primeiro a fonte.")}</p>
                <div className="rating-actions">
                  <button
                    type="button"
                    className={currentUserVote === 1 ? "btn btn-primary" : "btn"}
                    disabled={ratingBusy}
                    onClick={async () => {
                      if (!current || !activeUserId) return;
                      if (!canRate) {
                        setShowSourceVoteHint(true);
                        onToast(pick(language, "Primero abre el enlace y después valora.", "Open the source first, then rate."));
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
                      } else if (!canRate) {
                        setShowSourceVoteHint(true);
                        setCurrent((prev) => (prev ? { ...prev, feedbacks: previousFeedbacks } : prev));
                      } else {
                        setCurrent((prev) => (prev ? { ...prev, feedbacks: previousFeedbacks } : prev));
                      }
                      setRatingBusy(false);
                    }}
                  >
                    {pick(language, "Positiva", "Positive", "Positiva")}
                  </button>
                  <button
                    type="button"
                    className={currentUserVote === -1 ? "btn btn-primary" : "btn"}
                    disabled={ratingBusy}
                    onClick={async () => {
                      if (!current || !activeUserId) return;
                      if (!canRate) {
                        setShowSourceVoteHint(true);
                        onToast(pick(language, "Primero abre el enlace y después valora.", "Open the source first, then rate."));
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
                      } else if (!canRate) {
                        setShowSourceVoteHint(true);
                        setCurrent((prev) => (prev ? { ...prev, feedbacks: previousFeedbacks } : prev));
                      } else {
                        setCurrent((prev) => (prev ? { ...prev, feedbacks: previousFeedbacks } : prev));
                      }
                      setRatingBusy(false);
                    }}
                  >
                    {pick(language, "Negativa", "Negative", "Negativa")}
                  </button>
                </div>
                {showSourceVoteHint && !canRate ? (
                  <p className="warning">{pick(language, "Abre el enlace antes de valorarlo.", "Visit the source before rating it.", "Visita a fonte antes de valorala.")}</p>
                ) : null}
                {justOpenedExternal ? <p className="hint">{pick(language, "Gracias por revisar el enlace antes de votar.", "Thanks for checking the source before voting.", "Grazas por revisar a fonte antes de votar.")}</p> : null}
              </section>
            ) : null}

            <CommentsPanel
              post={current}
              usersById={usersById}
              activeUserId={activeUserId}
              onAddComment={onAddComment}
              onVoteCommentAura={onVoteCommentAura}
              onPostUpdate={setCurrent}
              onToast={onToast}
            />

            <section className="related-block">
              <h3>{pick(language, "Libros relacionados", "Related posts", "Novas relacionadas")}</h3>
              <div className="related-list">
                {related.map((item) => (
                  <button key={item.id} type="button" className="related-item" onClick={() => setCurrent(item)}>
                    <strong>{displayTitle(item)}</strong>
                    <span>{item.topics.slice(0, 2).join(" · ")} · {pick(language, "Aura", "Aura", "Aura")} {formatAuraScore(item.interestScore)}/100</span>
                  </button>
                ))}
              </div>
            </section>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
