import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { pick, translateRationale, useI18n } from "../lib/i18n";
import { EASE_STANDARD, MOTION_DURATION, VIEWPORT_ONCE } from "../lib/motion";
import { displayTitle, formatAuraScore, formatTopicLabel, previewImage } from "../lib/presentation";
import { topicColorVars } from "../lib/topicColors";
import type { Post, User } from "../lib/types";
import { Icon } from "./Icon";

interface PostCardProps {
  post: Post;
  canDelete?: boolean;
  onDelete?: (postId: string) => void;
  onOpenDetail?: (post: Post) => void;
  compact?: boolean;
  author?: User;
}

export const PostCard = ({ post, canDelete = false, onDelete, onOpenDetail, compact = false, author }: PostCardProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [auraOpen, setAuraOpen] = useState(false);
  const title = displayTitle(post);
  const coverImage = previewImage(post);
  const shouldAnimateIn = !compact;
  const auraHealthClass =
    post.interestScore >= 75 ? "aura-health-good" : post.interestScore >= 50 ? "aura-health-warn" : "aura-health-bad";
  const snippet = post.status === "collapsed"
    ? pick(language, "Libro oculto por moderación.", "Content hidden by moderation.", "Contido oculto por moderación.")
    : (post.text ?? "").trim();
  const auraWhy = post.rationale.slice(0, 3);
  const deleteTooltip = pick(language, "Clica aquí para eliminar", "Click here to delete", "Clica aquí para eliminar");

  const openDetail = () => onOpenDetail?.(post);

  return (
    <motion.article
      className={`post-card ${onOpenDetail ? "post-card-clickable" : ""} ${compact ? "post-card-compact" : ""}`}
      initial={shouldAnimateIn ? { opacity: 0, y: 8 } : false}
      whileInView={shouldAnimateIn ? { opacity: 1, y: 0 } : undefined}
      viewport={shouldAnimateIn ? VIEWPORT_ONCE : undefined}
      transition={shouldAnimateIn ? { duration: MOTION_DURATION.base, ease: EASE_STANDARD } : undefined}
      whileHover={onOpenDetail ? { y: -2, borderColor: "#5b8dcc" } : { y: -1.5 }}
      onClick={onOpenDetail ? openDetail : undefined}
      role={onOpenDetail ? "button" : undefined}
      tabIndex={onOpenDetail ? 0 : -1}
      onKeyDown={
        onOpenDetail
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDetail();
              }
            }
          : undefined
      }
      onMouseLeave={() => setAuraOpen(false)}
    >
      {coverImage && post.status !== "collapsed" ? (
        <div className="post-media">
          <img src={coverImage} alt={title} loading="lazy" />
          <div className="post-media-topics">
            {post.topics.slice(0, 3).map((topic) => (
              <button
                type="button"
                className="chip chip-action chip-topic"
                key={topic}
                style={topicColorVars(topic)}
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/topic/${topic}`);
                }}
              >
                {formatTopicLabel(topic)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!coverImage ? (
        <div className="chips chips-inline">
          {post.topics.slice(0, 3).map((topic) => (
            <button
              type="button"
              className="chip chip-action chip-topic"
              key={topic}
              style={topicColorVars(topic)}
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/topic/${topic}`);
              }}
            >
              {formatTopicLabel(topic)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="post-header-row post-header-grid">
        <h3>{title}</h3>
        <div className="post-header-actions">
          <span className="interest-wrap">
            <button
              type="button"
              className={`badge aura-health aura-badge-btn ${auraHealthClass}`}
              onClick={(event) => {
                event.stopPropagation();
                setAuraOpen((prev) => !prev);
              }}
              onBlur={() => setAuraOpen(false)}
              aria-expanded={auraOpen}
            >
              {pick(language, "Aura", "Aura")} {formatAuraScore(post.interestScore)}
            </button>
            <span className={auraOpen ? "interest-tooltip open" : "interest-tooltip"}>
              <strong>{pick(language, "Por qué tiene este Aura", "Why this Aura score", "Por que ten esta Aura")}</strong>
              {auraWhy.length > 0 ? (
                <ul>
                  {auraWhy.map((line) => (
                    <li key={line}>{translateRationale(language, line)}</li>
                  ))}
                </ul>
              ) : (
                <p>{pick(language, "Sale de señales del grupo y del contexto del hilo.", "Based on group signals and thread context.", "Sae de sinais do grupo e do contexto do fío.")}</p>
              )}
            </span>
          </span>
        </div>
      </div>

      {canDelete && onDelete ? (
        <button
          type="button"
          className="delete-chip delete-chip-corner"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(post.id);
          }}
          title={deleteTooltip}
          aria-label={deleteTooltip}
          data-tooltip={deleteTooltip}
        >
          <Icon name="trash" size={13} />
        </button>
      ) : null}

      {author ? (
        <p className="post-byline">
          {pick(language, "Por", "By", "Por")}{" "}
          <Link
            to={`/profile/${author.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            {author.alias}
          </Link>
        </p>
      ) : null}
      {snippet ? <p className="post-text post-snippet">{snippet}</p> : null}

    </motion.article>
  );
};
