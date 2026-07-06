import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasUnseenFeed, readCachedFeed, refreshFeed } from "../lib/activityFeed";
import { markFetched } from "../lib/freshness";
import { pick, useI18n } from "../lib/i18n";
import { Icon, type IconName } from "./Icon";

// Dock inferior (tab bar de app): Biblioteca · Lectura · Club · Tú.
// La navegación principal vive aquí, al alcance del pulgar; la cabecera queda
// para la identidad del club y la campana.
interface DockNavProps {
  /** id del libro en lectura (destacado primero); null → la pestaña Lectura lleva a la estantería */
  currentBookId: string | null;
}

// Un refresco de actividad por sesión de app (para el puntito del Club).
let refreshedThisSession = false;

export const DockNav = ({ currentBookId }: DockNavProps) => {
  const { language } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [feedEvents, setFeedEvents] = useState(() => readCachedFeed());

  useEffect(() => {
    if (refreshedThisSession) return;
    refreshedThisSession = true;
    const w = window as typeof window & { requestIdleCallback?: (cb: () => void) => number };
    const run = () => {
      void refreshFeed().then((fresh) => { markFetched("activity"); setFeedEvents(fresh); }).catch(() => undefined);
    };
    if (w.requestIdleCallback) w.requestIdleCallback(run);
    else window.setTimeout(run, 1500);
  }, []);

  // Al volver de /feed (marcado como visto) el puntito debe apagarse.
  useEffect(() => {
    setFeedEvents(readCachedFeed());
  }, [location.pathname]);

  const path = location.pathname;
  const active: "home" | "read" | "feed" | "me" =
    path.startsWith("/book") ? "read"
      : path.startsWith("/feed") ? "feed"
        : path.startsWith("/me") || path.startsWith("/settings") || path.startsWith("/community") || path.startsWith("/profile") ? "me"
          : "home";

  const tabs: Array<{ key: typeof active; icon: IconName; label: string; go: () => void; dot?: boolean }> = [
    {
      key: "home",
      icon: "books",
      label: pick(language, "Biblioteca", "Library", "Biblioteca"),
      go: () => navigate("/home")
    },
    {
      key: "read",
      icon: "book",
      label: pick(language, "Lectura", "Reading", "Lectura"),
      go: () => navigate(currentBookId ? `/book/${currentBookId}` : "/home")
    },
    {
      key: "feed",
      icon: "comment",
      label: pick(language, "Club", "Club", "Club"),
      go: () => navigate("/feed"),
      dot: hasUnseenFeed(feedEvents) && !path.startsWith("/feed")
    },
    {
      key: "me",
      icon: "user",
      label: pick(language, "Tú", "You", "Ti"),
      go: () => navigate("/me")
    }
  ];

  return (
    <nav className="dock-nav" aria-label={pick(language, "Navegación principal", "Main navigation", "Navegación principal")}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`dock-tab${active === tab.key ? " is-active" : ""}`}
          onClick={tab.go}
          aria-current={active === tab.key ? "page" : undefined}
        >
          <span className="dock-tab-icon">
            <Icon name={tab.icon} size={22} />
            {tab.dot ? <span className="notification-dot" /> : null}
          </span>
          <span className="dock-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};
