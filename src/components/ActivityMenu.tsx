import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { communityActivity, type ActivityEvent } from "../lib/communityApi";
import { pick, useI18n } from "../lib/i18n";
import { timeAgo } from "../lib/timeAgo";
import { Icon } from "./Icon";
import { UserBadge } from "./UserBadge";

// "El pulso del club": la actividad reciente (quién leyó/comentó/propuso) vive
// en el header como menú desplegable, junto a la campana. La campana es "lo que
// te afecta a ti"; esto es "vida del club" — se consulta cuando apetece, en vez
// de imponerse como tira en la home (que además empujaba el layout al cargar).
// Caché stale-while-revalidate + marca de "visto" para el puntito.

const CACHE_KEY = "wee:activity";
const SEEN_KEY = "wee:activity:seen";

const readCache = (): ActivityEvent[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { events: ActivityEvent[] } | null;
    return parsed && Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
};
const writeCache = (events: ActivityEvent[]): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ events }));
  } catch {
    // storage lleno/bloqueado: seguimos sin caché
  }
};
const readSeen = (): number => {
  const n = Number(localStorage.getItem(SEEN_KEY) ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Un refresco en segundo plano por sesión de app (el resto, al abrir el menú).
let refreshedThisSession = false;

export const ActivityMenu = () => {
  const { language } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>(() => readCache());
  const [seenAt, setSeenAt] = useState<number>(() => readSeen());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const refresh = () => {
    void communityActivity()
      .then(({ events: fresh }) => {
        setEvents(fresh);
        writeCache(fresh);
      })
      .catch(() => undefined); // sin red: se queda lo cacheado
  };

  useEffect(() => {
    if (refreshedThisSession) return;
    refreshedThisSession = true;
    const w = window as typeof window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(refresh);
    else window.setTimeout(refresh, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const line = (ev: ActivityEvent): string =>
    ev.kind === "comment" ? pick(language, `comentó en «${ev.bookTitle}»`, `commented on “${ev.bookTitle}”`, `comentou en «${ev.bookTitle}»`)
      : ev.kind === "note" ? pick(language, `anotó en «${ev.bookTitle}»`, `annotated “${ev.bookTitle}”`, `anotou en «${ev.bookTitle}»`)
        : ev.kind === "read" ? pick(language, `leyó un capítulo de «${ev.bookTitle}»`, `read a chapter of “${ev.bookTitle}”`, `leu un capítulo de «${ev.bookTitle}»`)
          : pick(language, `propuso «${ev.bookTitle}»`, `proposed “${ev.bookTitle}”`, `propuxo «${ev.bookTitle}»`);

  const href = (ev: ActivityEvent): string =>
    ev.kind === "comment" && ev.commentId ? `/book/${ev.bookId}#c-${ev.commentId}` : `/book/${ev.bookId}`;

  const hasUnseen = events.some((ev) => (ev.at ?? 0) > seenAt);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        refresh();
        const now = Date.now();
        setSeenAt(now);
        try {
          localStorage.setItem(SEEN_KEY, String(now));
        } catch {
          // noop
        }
      }
      return next;
    });
  };

  return (
    <div className="topbar-notifications" ref={rootRef}>
      <button
        type="button"
        className="notification-trigger"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={pick(language, "El club hoy", "Club activity", "O club hoxe")}
        title={pick(language, "El club hoy", "Club activity", "O club hoxe")}
      >
        <Icon name="spark" size={16} />
        {hasUnseen && !open ? <span className="notification-dot" /> : null}
      </button>

      {open ? (
        <div className="notification-dropdown" role="menu" aria-label={pick(language, "El club hoy", "Club activity", "O club hoxe")}>
          <div className="notification-head">
            <strong>{pick(language, "El club hoy", "The club today", "O club hoxe")}</strong>
          </div>

          <div className="notification-list">
            {events.length === 0 ? (
              <p className="hint">{pick(language, "Hoy el club está tranquilo. Deja tú la primera señal.", "The club is quiet today. Leave the first sign.", "Hoxe o club está tranquilo. Deixa ti o primeiro sinal.")}</p>
            ) : (
              events.slice(0, 20).map((ev, i) => (
                <button
                  key={`${ev.bookId}-${ev.at}-${i}`}
                  type="button"
                  className="notification-item activity-item"
                  onClick={() => {
                    setOpen(false);
                    navigate(href(ev));
                  }}
                >
                  <span className="activity-item-line">
                    <UserBadge alias={ev.actorAlias} avatarUrl={ev.actorAvatarUrl ?? undefined} colorIndex={ev.actorColorIndex ?? undefined} withAvatar />
                    <span className="activity-item-text">{line(ev)}</span>
                  </span>
                  <span className="activity-chip-time">{timeAgo(ev.at, language)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
