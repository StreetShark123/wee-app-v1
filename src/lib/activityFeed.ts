// Estado compartido del feed del club ("Club" en el dock): caché
// stale-while-revalidate de la actividad + marca de "visto" para el puntito
// de la pestaña. Lo usan DockNav (puntito) y FeedPage (contenido).
import { communityActivity, type ActivityEvent } from "./communityApi";

const CACHE_KEY = "wee:activity";
const SEEN_KEY = "wee:activity:seen";

export const readCachedFeed = (): ActivityEvent[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { events: ActivityEvent[] } | null;
    return parsed && Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
};

const writeCachedFeed = (events: ActivityEvent[]): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ events }));
  } catch {
    // storage lleno/bloqueado: seguimos sin caché
  }
};

export const readFeedSeenAt = (): number => {
  const n = Number(localStorage.getItem(SEEN_KEY) ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const markFeedSeen = (): void => {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // noop
  }
};

export const hasUnseenFeed = (events: ActivityEvent[]): boolean => {
  const seen = readFeedSeenAt();
  return events.some((ev) => (ev.at ?? 0) > seen);
};

export const refreshFeed = async (): Promise<ActivityEvent[]> => {
  const { events } = await communityActivity();
  writeCachedFeed(events);
  return events;
};
