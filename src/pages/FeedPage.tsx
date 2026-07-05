import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { UserBadge } from "../components/UserBadge";
import { markFeedSeen, readCachedFeed, refreshFeed } from "../lib/activityFeed";
import type { ActivityEvent } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { notificationHref, notificationLabel, useNotifications } from "../lib/notifications";
import { timeAgo } from "../lib/timeAgo";

// "Club": la vida del club como feed navegable (solo lectura). Dos capas:
// "Para ti" (avisos personales: menciones, respuestas, reacciones — antes en la
// campana del header) y "El club hoy" (actividad del club). Cada señal salta al
// evento concreto (comentario/nota/capítulo), no solo al libro.
export const FeedPage = () => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [events, setEvents] = useState<ActivityEvent[]>(() => readCachedFeed());
  const [loading, setLoading] = useState(events.length === 0);

  useEffect(() => {
    markFeedSeen();
    let alive = true;
    void refreshFeed()
      .then((fresh) => {
        if (!alive) return;
        setEvents(fresh);
        markFeedSeen();
      })
      .catch(() => undefined) // sin red: se queda lo cacheado
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const line = (ev: ActivityEvent): string =>
    ev.kind === "comment" ? pick(language, "comentó en", "commented on", "comentou en")
      : ev.kind === "note" ? pick(language, "dejó una nota en", "left a note on", "deixou unha nota en")
        : ev.kind === "read" ? pick(language, "leyó un capítulo de", "read a chapter of", "leu un capítulo de")
          : pick(language, "propuso", "proposed", "propuxo");

  const href = (ev: ActivityEvent): string =>
    ev.kind === "comment" && ev.commentId ? `/book/${ev.bookId}#c-${ev.commentId}`
      : ev.kind === "note" && ev.noteId ? `/book/${ev.bookId}#note-${ev.noteId}`
        : ev.kind === "read" && ev.chapterId ? `/book/${ev.bookId}#ch-${ev.chapterId}`
          : `/book/${ev.bookId}`;

  return (
    <main>
      <div className="feed-page">
        {notifications.length > 0 ? (
          <section className="feed-section feed-foryou">
            <div className="section-head feed-head">
              <h2><Icon name="bell" /> {pick(language, "Para ti", "For you", "Para ti")}</h2>
              {unreadCount > 0 ? (
                <button type="button" className="link-btn" onClick={markAllAsRead}>
                  {pick(language, "Marcar leídas", "Mark read", "Marcar lidas")}
                </button>
              ) : null}
            </div>
            <div className="feed-list">
              {notifications.slice(0, 12).map((n) => (
                <Link
                  key={n.id}
                  to={notificationHref(n)}
                  className={`feed-item page-section${n.readAt ? "" : " is-unread"}`}
                >
                  <span className="feed-item-head">
                    <span className="feed-item-action">{notificationLabel(n, language)}</span>
                    <span className="activity-chip-time">{timeAgo(n.createdAt, language)}</span>
                  </span>
                  {n.bookTitle ? (
                    <span className="feed-item-book">
                      <Icon name="book" size={12} /> {n.bookTitle}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="feed-section">
          <div className="section-head feed-head">
            <h2><Icon name="comment" /> {pick(language, "El club hoy", "The club today", "O club hoxe")}</h2>
          </div>
          <p className="hint feed-intro">{pick(language, "Lo que se mueve en las últimas 24 horas. Toca una señal para ir al evento.", "What's moving in the last 24 hours. Tap a signal to jump to the event.", "O que se move nas últimas 24 horas. Toca un sinal para ir ao evento.")}</p>

          {events.length === 0 ? (
            <article className="page-section empty-state">
              <h3>{loading
                ? pick(language, "Escuchando al club...", "Listening to the club...", "Escoitando o club...")
                : pick(language, "Hoy el club está tranquilo", "The club is quiet today", "Hoxe o club está tranquilo")}</h3>
              {!loading ? (
                <p>{pick(language, "Deja tú la primera señal: una nota, un comentario, una propuesta.", "Leave the first sign: a note, a comment, a proposal.", "Deixa ti o primeiro sinal: unha nota, un comentario, unha proposta.")}</p>
              ) : null}
            </article>
          ) : (
            <div className="feed-list">
              {events.map((ev, i) => (
                <button
                  key={`${ev.bookId}-${ev.at}-${i}`}
                  type="button"
                  className="feed-item page-section"
                  onClick={() => navigate(href(ev))}
                >
                  <span className="feed-item-head">
                    <UserBadge alias={ev.actorAlias} avatarUrl={ev.actorAvatarUrl ?? undefined} colorIndex={ev.actorColorIndex ?? undefined} withAvatar />
                    <span className="feed-item-action">{line(ev)}</span>
                    <span className="activity-chip-time">{timeAgo(ev.at, language)}</span>
                  </span>
                  <span className="feed-item-book">
                    <Icon name="book" size={12} /> {ev.bookTitle}
                  </span>
                  {ev.kind === "comment" && ev.text ? (
                    <span className="feed-item-quote">«{ev.text}»</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
