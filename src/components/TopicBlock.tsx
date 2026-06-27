import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { pick, useI18n } from "../lib/i18n";
import { EASE_STANDARD, MOTION_DURATION, VIEWPORT_ONCE } from "../lib/motion";
import { displayTitle, extractNewsDate, formatNewsDate, formatTopicLabel, topicIntro } from "../lib/presentation";
import { topicColorVars } from "../lib/topicColors";
import { rankTopicPosts, topicAverageAura } from "../lib/topicForum";
import type { Post } from "../lib/types";

interface TopicBlockProps {
  topic: string;
  posts: Post[];
}

export const TopicBlock = ({ topic, posts }: TopicBlockProps) => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const ranked = useMemo(() => rankTopicPosts(posts, topic), [posts, topic]);
  const latest = ranked[0];
  const updates = ranked.slice(0, expanded ? 4 : 1);
  const now = Date.now();
  const hotCount = ranked.filter((post) => now - post.createdAt < 1000 * 60 * 60 * 24).length;
  const veryRecentCount = ranked.filter((post) => now - post.createdAt < 1000 * 60 * 60 * 6).length;
  const avgAura = topicAverageAura(ranked);
  const chiliCount = Math.min(3, veryRecentCount);
  const style = topicColorVars(topic);
  const intro = topicIntro([topic], language);

  return (
    <motion.article
      className="topic-block"
      style={style}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
      whileHover={{ y: -1.5 }}
      onClick={() => navigate(`/topic/${topic}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(`/topic/${topic}`);
        }
      }}
    >
      <div className="topic-head">
        <h4 className="topic-title">{formatTopicLabel(topic)}</h4>
        <div className="topic-head-badges">
          <span className="topic-hot-tag"><Icon name="chili" size={13} /> {pick(language, "Ahora mismo", "Happening now", "Agora mesmo")}: {hotCount}</span>
          <span className="badge"><Icon name="spark" size={12} /> {pick(language, "Aura media", "Avg Aura", "Aura media")} {avgAura}</span>
        </div>
      </div>
      <p className="topic-summary">{intro}</p>
      <p className="topic-meta">{pick(language, "Libros en este tema", "Posts in this topic", "Publicacións neste tema")}: {posts.length}</p>

      {latest ? (
        <p className="topic-last-update">{pick(language, "Última actualización", "Last update", "Última actualización")}: {formatNewsDate(extractNewsDate(latest))}</p>
      ) : null}

      <div className="topic-updates">
        {updates.map((post) => (
          <button
            key={post.id}
            className="topic-update-item"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/post/${post.id}`);
            }}
          >
            <span className="topic-update-date">{formatNewsDate(extractNewsDate(post))}</span>
            <span className="topic-update-title">{displayTitle(post)}</span>
          </button>
        ))}
      </div>

      <div className="topic-actions">
        {chiliCount > 0 ? (
          <span className="topic-recency-badge">
            <span>{pick(language, "Muy reciente", "Very recent", "Moi recente")}</span>
            <span className="topic-recency-chilis" aria-label={pick(language, "Nivel de recencia", "Recency level", "Nivel de recencia")}>
              {Array.from({ length: chiliCount }).map((_, index) => (
                <Icon key={`${topic}-${index}`} name="chili" size={13} />
              ))}
            </span>
          </span>
        ) : null}
        {ranked.length > 1 ? (
          <button
            type="button"
            className="link-btn"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((curr) => !curr);
            }}
          >
            {expanded ? pick(language, "Ver menos", "Show less", "Ver menos") : pick(language, "Ver últimas del hilo", "See latest in thread", "Ver últimas do fío")}
          </button>
        ) : null}
      </div>
    </motion.article>
  );
};
