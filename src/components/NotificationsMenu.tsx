import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { pick, useI18n } from "../lib/i18n";
import { useNotifications } from "../lib/notifications";
import { timeAgo } from "../lib/timeAgo";
import { Icon } from "./Icon";

export const NotificationsMenu = () => {
  const { language } = useI18n();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div className="topbar-notifications" ref={rootRef}>
      <button
        type="button"
        className="notification-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={pick(language, "Notificaciones", "Notifications", "Notificacións")}
      >
        <Icon name="bell" size={16} />
        {unreadCount > 0 ? <span className="notification-dot" /> : null}
      </button>

      {open ? (
        <div className="notification-dropdown" role="menu" aria-label={pick(language, "Notificaciones", "Notifications", "Notificacións")}>
          <div className="notification-head">
            <strong>{pick(language, "Notificaciones", "Notifications", "Notificacións")}</strong>
            <button type="button" className="link-btn" onClick={markAllAsRead}>
              {pick(language, "Marcar todo como leído", "Mark all as read", "Marcar todo como lido")}
            </button>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="hint">{pick(language, "Todo tranquilo por ahora.", "All quiet for now.", "Todo tranquilo por agora.")}</p>
            ) : (
              notifications.slice(0, 14).map((notification) => (
                <Link
                  key={notification.id}
                  to={notification.bookId ? `/book/${notification.bookId}${notification.commentId ? `#c-${notification.commentId}` : ""}` : "/home"}
                  className={notification.readAt ? "notification-item" : "notification-item unread"}
                  onClick={() => setOpen(false)}
                >
                  <span className="notification-item-title">
                    {notification.kind === "mention"
                      ? pick(language, `${notification.actorAlias} te mencionó`, `${notification.actorAlias} mentioned you`, `${notification.actorAlias} mencionoute`)
                      : notification.kind === "reply"
                        ? pick(language, `${notification.actorAlias} respondió a tu comentario`, `${notification.actorAlias} replied to your comment`, `${notification.actorAlias} respondeu ao teu comentario`)
                        : notification.kind === "reaction"
                        ? pick(language, `A ${notification.actorAlias} le gustó tu comentario`, `${notification.actorAlias} liked your comment`, `A ${notification.actorAlias} gustoulle o teu comentario`)
                        : notification.kind === "note_comment"
                        ? pick(language, `${notification.actorAlias} comentó tu nota`, `${notification.actorAlias} commented on your note`, `${notification.actorAlias} comentou a túa nota`)
                        : notification.kind === "meeting_set"
                          ? pick(language, "Hay cita para comentar un libro", "There's a date to discuss a book", "Hai cita para comentar un libro")
                        : notification.kind === "reminder"
                          ? pick(language, "Recordatorio: una propuesta espera tu voto", "Reminder: a proposal is waiting for your vote", "Recordatorio: hai unha proposta esperando o teu voto")
                        : notification.kind === "book_proposed"
                          ? pick(language, `${notification.actorAlias} propuso un libro: ¡vota!`, `${notification.actorAlias} proposed a book — vote!`, `${notification.actorAlias} propuxo un libro: vota!`)
                          : notification.kind === "book_approved"
                            ? pick(language, "El club va a leer un libro nuevo", "The club is reading a new book", "O club vai ler un libro novo")
                            : notification.kind === "book_finished"
                              ? pick(language, "¡El club terminó un libro!", "The club finished a book!", "O club rematou un libro!")
                              : notification.kind === "join_approved"
                                ? pick(language, "Te han aceptado en el club", "You've been accepted into the club", "Aceptáronte no club")
                                : pick(language, "Ahora eres admin del club", "You're now a club admin", "Agora es admin do club")}
                  </span>
                  <span className="notification-item-meta">
                    {notification.bookTitle ? <span className="notification-item-post">{notification.bookTitle}</span> : null}
                    <span className="notification-item-time">{timeAgo(notification.createdAt, language)}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
