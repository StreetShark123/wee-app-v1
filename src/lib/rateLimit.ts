export type RateLimitAction = "create_post" | "create_comment" | "vote_post";

export interface RateLimitRule {
  limit: number;
  windowSec: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  source: "remote" | "local";
}

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const RATE_LIMIT_RULES: Record<RateLimitAction, RateLimitRule> = {
  create_post: {
    limit: toNumber(import.meta.env.VITE_RATE_LIMIT_POSTS_PER_10M as string | undefined, 4),
    windowSec: 10 * 60
  },
  create_comment: {
    limit: toNumber(import.meta.env.VITE_RATE_LIMIT_COMMENTS_PER_5M as string | undefined, 8),
    windowSec: 5 * 60
  },
  vote_post: {
    limit: toNumber(import.meta.env.VITE_RATE_LIMIT_VOTES_PER_5M as string | undefined, 20),
    windowSec: 5 * 60
  }
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const memoryStorage = new Map<string, string>();
const fallbackStorage: StorageLike = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  setItem: (key, value) => {
    memoryStorage.set(key, value);
  }
};

const getStorage = (): StorageLike => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore
  }
  return fallbackStorage;
};

const storageKey = (userId: string, action: RateLimitAction): string => `wee:rate:${userId}:${action}`;

export const consumeLocalRateLimit = (
  action: RateLimitAction,
  userId: string,
  now = Date.now(),
  storage: StorageLike = getStorage()
): RateLimitDecision => {
  const rule = RATE_LIMIT_RULES[action];
  const key = storageKey(userId, action);
  const windowStart = now - rule.windowSec * 1000;
  const raw = storage.getItem(key);
  const values = raw ? (JSON.parse(raw) as number[]) : [];
  const recent = values.filter((ts) => Number.isFinite(ts) && ts >= windowStart).sort((a, b) => a - b);

  if (recent.length >= rule.limit) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + rule.windowSec * 1000 - now) / 1000));
    console.warn("rate_limit_block", { action, userId, retryAfterSec, source: "local" });
    storage.setItem(key, JSON.stringify(recent));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
      source: "local"
    };
  }

  const next = [...recent, now];
  storage.setItem(key, JSON.stringify(next));
  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - next.length),
    retryAfterSec: 0,
    source: "local"
  };
};

