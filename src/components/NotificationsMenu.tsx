import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { pick, useI18n } from "../lib/i18n";
import { useNotifications } from "../lib/notifications";
import { Icon } from "./Icon";

export const NotificationsMenu = () => {
  const { language } = useI18n();
  const { notifications, unreadCount, lastReadAt, markAllAsRead } = useNotifications();
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
              notifications.slice(0, 14).map((notification) => {
                const isUnread = notification.createdAt > lastReadAt;
                return (
                  <Link
                    key={notification.id}
                    to={`/post/${notification.postId}`}
                    className={isUnread ? "notification-item unread" : "notification-item"}
                    onClick={() => setOpen(false)}
                  >
                    <span className="notification-item-title">
                      {notification.type === "post_comment"
                        ? pick(language, `${notification.actorAlias} comentó tu libro`, `${notification.actorAlias} commented on your post`, `${notification.actorAlias} comentou a túa nova`)
                        : notification.vote === -1
                          ? pick(language, `${notification.actorAlias} bajó el Aura`, `${notification.actorAlias} lowered Aura`, `${notification.actorAlias} baixou a Aura`)
                          : pick(language, `${notification.actorAlias} subió el Aura`, `${notification.actorAlias} raised Aura`, `${notification.actorAlias} subiu a Aura`)}
                    </span>
                    <span className="notification-item-post">{notification.postTitle}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
