// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type InvitePolicy = "admins_only" | "members_allowed";
type Role = "admin" | "member";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_ORIGIN = (Deno.env.get("APP_ORIGIN") ?? "").replace(/\/+$/, "");
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const json = (status: number, body: Record<string, unknown>, extraHeaders?: HeadersInit): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // CORS: bloqueado al origen de la app (APP_ORIGIN). Fallback a "*" solo si
      // no está configurado (p.ej. dev local). Evita que cualquier web llame a la
      // API con credenciales. `Vary: Origin` para no cachear cruzado.
      "Access-Control-Allow-Origin": APP_ORIGIN || "*",
      "Vary": "Origin",
      "Access-Control-Allow-Headers": "content-type,authorization,apikey,x-client-info,x-wee-session,x-wee-global-session",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      ...extraHeaders
    }
  });

const normalizeAlias = (alias: string): string =>
  alias
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeCode = (code: string): string => code.trim().toUpperCase();

// Slug de club (URL propia): minúsculas, sin acentos básicos, guiones.
const slugify = (name: string): string =>
  (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "club";

const uniqueSlug = async (name: string): Promise<string> => {
  const base = slugify(name);
  let slug = base;
  for (let i = 1; i <= 60; i++) {
    const { data } = await db.from("communities").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
};
const normalizeCommunityName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const randomCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => (b % 36).toString(36))
    .join("")
    .toUpperCase();

const randomToken = (): string => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

const sha256Hex = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
};

// ── Password hashing: PBKDF2-SHA256, salt por usuario ──────────────────────
// Formato: pbkdf2$<iters>$<saltB64>$<hashB64>. Las contraseñas viejas son
// SHA-256 hex pelado (64 chars) y se re-hashean al primer login correcto.
const PBKDF2_ITERS = 150_000;
const b64encode = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64decode = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const pbkdf2Hash = async (password: string, salt: Uint8Array, iters: number): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" }, key, 256);
  return b64encode(bits);
};

const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hash(password, salt, PBKDF2_ITERS);
  return `pbkdf2$${PBKDF2_ITERS}$${b64encode(salt.buffer)}$${hash}`;
};

// Comparación en tiempo constante (evita timing oracle sobre el hash).
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

const verifyPassword = async (password: string, stored: string): Promise<{ ok: boolean; needsRehash: boolean }> => {
  if (stored.startsWith("pbkdf2$")) {
    const [, itersStr, saltB64, hashB64] = stored.split("$");
    const iters = Number.parseInt(itersStr, 10) || PBKDF2_ITERS;
    const calc = await pbkdf2Hash(password, b64decode(saltB64), iters);
    return { ok: timingSafeEqual(calc, hashB64 ?? ""), needsRehash: iters < PBKDF2_ITERS };
  }
  // Legacy SHA-256 hex
  const calc = await sha256Hex(password);
  const ok = timingSafeEqual(calc, stored);
  return { ok, needsRehash: ok };
};

const nowIso = (): string => new Date().toISOString();

// Acepta URLs http(s) o imágenes subidas como data URL (data:image/...;base64).
// Bloquea javascript:/data:text/html/file: y demás esquemas peligrosos que
// podrían inyectarse en un <img src>/<a href> del cliente.
const safeHttpUrl = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Imagen subida del dispositivo: solo data URL de imagen, sin truncar (es larga).
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(s)) {
    return s.length <= 1_500_000 ? s : null;
  }
  const url = s.slice(0, 1000);
  return /^https?:\/\//i.test(url) ? url : null;
};

// ── Rate limiting server-side (tabla auth_throttle) ────────────────────────
const clientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip")?.trim() ||
  "unknown";

// Devuelve true si la clave SUPERA el límite (debe bloquearse). Fail-open ante
// error de BD para no tumbar el login por un fallo del contador.
const isRateLimited = async (key: string, max: number, windowSec = 900): Promise<boolean> => {
  try {
    const now = Date.now();
    const { data } = await db.from("auth_throttle").select("count,window_start").eq("key", key).maybeSingle();
    if (!data || now - Date.parse(data.window_start as string) > windowSec * 1000) {
      await db.from("auth_throttle").upsert({ key, count: 1, window_start: new Date(now).toISOString() }, { onConflict: "key" });
      return false;
    }
    if ((data.count as number) >= max) return true;
    await db.from("auth_throttle").update({ count: (data.count as number) + 1 }).eq("key", key);
    return false;
  } catch {
    return false;
  }
};

const tooManyAttempts = () =>
  json(429, { message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." });

// Para escritura de contenido (no login): mensaje amable, no de "ataque".
const slowDown = () =>
  json(429, { code: "slow_down", message: "Vas muy rápido. Respira un momento y sigue en unos segundos." });

const extractSessionToken = (req: Request): string | null => {
  const header = req.headers.get("x-wee-session");
  if (header?.trim()) return header.trim();
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/wee_session=([^;]+)/);
  return m?.[1] ?? null;
};

const extractGlobalSessionToken = (req: Request): string | null => {
  const header = req.headers.get("x-wee-global-session");
  if (header?.trim()) return header.trim();
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/wee_global_session=([^;]+)/);
  return m?.[1] ?? null;
};

const requireGlobalSession = async (req: Request): Promise<{
  session: { id: string; user_id: string; expires_at: string; revoked_at: string | null };
  user: { id: string; username: string; email: string | null };
} | Response> => {
  const token = extractGlobalSessionToken(req);
  if (!token) return json(401, { message: "Missing global session" });
  const tokenHash = await sha256Hex(token);
  const { data: session, error } = await db
    .from("global_sessions")
    .select("id,user_id,expires_at,revoked_at")
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !session) return json(401, { message: "Invalid global session" });
  if (Date.parse(session.expires_at) <= Date.now()) return json(401, { message: "Global session expired" });

  const { data: user, error: uErr } = await db
    .from("global_users")
    .select("id,username,email")
    .eq("id", session.user_id)
    .maybeSingle();
  if (uErr || !user) return json(401, { message: "Global user not found" });

  return { session, user };
};

const requireSession = async (req: Request): Promise<{
  session: { id: string; user_id: string; community_id: string; expires_at: string; revoked_at: string | null };
  user: { id: string; alias: string; status: string };
  role: Role;
  community: { id: string; name: string; description: string | null; rules_text: string | null; invite_policy: InvitePolicy };
} | Response> => {
  const token = extractSessionToken(req);
  if (!token) return json(401, { message: "Missing session" });
  const tokenHash = await sha256Hex(token);
  const { data: session, error } = await db
    .from("sessions")
    .select("id,user_id,community_id,expires_at,revoked_at")
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !session) return json(401, { message: "Invalid session" });
  if (Date.parse(session.expires_at) <= Date.now()) return json(401, { message: "Session expired" });

  const [userRes, roleRes, communityRes] = await Promise.all([
    db
      .from("community_users")
      .select("id,alias,status")
      .eq("id", session.user_id)
      .eq("community_id", session.community_id)
      .maybeSingle(),
    db
      .from("community_user_roles")
      .select("role")
      .eq("community_id", session.community_id)
      .eq("user_id", session.user_id)
      .maybeSingle(),
    db
      .from("communities")
      .select("id,name,description,rules_text,invite_policy")
      .eq("id", session.community_id)
      .maybeSingle()
  ]);

  if (userRes.error || !userRes.data || userRes.data.status !== "active") return json(403, { message: "Membership required" });
  if (roleRes.error || !roleRes.data) return json(403, { message: "Role missing" });
  if (communityRes.error || !communityRes.data) return json(404, { message: "Community not found" });

  return {
    session,
    user: userRes.data,
    role: roleRes.data.role as Role,
    community: communityRes.data as { id: string; name: string; description: string | null; rules_text: string | null; invite_policy: InvitePolicy }
  };
};

const bad = (message: string): Response => json(400, { message });
const gone = (message: string): Response => json(410, { message });

const ensureAdmin = (role: Role): Response | null => (role === "admin" ? null : json(403, { message: "Admin required" }));

// Owner del club = communities.created_by_user_id. Solo el propio owner puede
// degradarse/salir; ningún otro admin puede degradar ni expulsar al owner.
const ownerOf = async (communityId: string): Promise<string | null> => {
  const { data } = await db.from("communities").select("created_by_user_id").eq("id", communityId).maybeSingle();
  return (data?.created_by_user_id as string | undefined) ?? null;
};

// 403 si el miembro está silenciado (muted_until en el futuro); null si puede escribir.
const mutedGate = async (communityId: string, userId: string): Promise<Response | null> => {
  const { data } = await db.from("community_users").select("muted_until").eq("community_id", communityId).eq("id", userId).maybeSingle();
  const until = data?.muted_until ? new Date(String(data.muted_until)).getTime() : 0;
  if (until > Date.now()) {
    return json(403, { code: "muted", until, message: "Estás en silencio temporal en este club. Podrás volver a escribir pronto." });
  }
  return null;
};

// Errores de BD: loguea el detalle real en servidor y devuelve un mensaje
// genérico. Evita filtrar nombres de columnas/constraints de Postgres al cliente.
const dbFail = (status: number, err: unknown, clientMessage = "Something went wrong"): Response => {
  console.error("[community-api] db error:", err instanceof Error ? err.message : err);
  return json(status, { message: clientMessage });
};

const canManageInvites = (role: Role, policy: InvitePolicy): boolean => role === "admin" || policy === "members_allowed";

const parseBody = async (req: Request): Promise<Record<string, any>> => {
  try {
    return (await req.json()) as Record<string, any>;
  } catch {
    return {};
  }
};

const buildInviteUrl = (code: string): string => {
  const path = `#/join?code=${encodeURIComponent(code)}`;
  return APP_ORIGIN ? `${APP_ORIGIN}/${path}` : path;
};

const toMillis = (value: string | null | undefined): number =>
  value ? Date.parse(value) || Date.now() : Date.now();

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

const normalizePostPayload = (post: Record<string, any>): Record<string, any> => ({
  ...post,
  topics: Array.isArray(post.topics) && post.topics.length > 0 ? post.topics : ["misc"],
  subtopics: Array.isArray(post.subtopics) ? post.subtopics : [],
  flags: Array.isArray(post.flags) ? post.flags : [],
  rationale: Array.isArray(post.rationale) ? post.rationale : [],
  interestScore: Math.max(1, Math.min(100, Number(post.interestScore ?? 50) || 50)),
  qualityScore: Math.max(0, Math.min(100, Number(post.qualityScore ?? 50) || 50))
});

const rowToCommunityUser = (row: Record<string, any>): Record<string, any> => ({
  id: row.id,
  alias: row.alias,
  avatarDataUrl: row.avatar_url ?? undefined,
  role: row.community_user_roles?.[0]?.role === "admin" ? "admin" : "member",
  language: row.language ?? "es",
  createdAt: toMillis(row.created_at)
});

const rowToBook = (row: Record<string, any>): Record<string, any> => ({
  id: row.id,
  communityId: row.community_id,
  addedBy: row.added_by ?? undefined,
  isbn: row.isbn ?? undefined,
  title: row.title,
  author: row.author ?? undefined,
  coverUrl: row.cover_url ?? undefined,
  description: row.description ?? undefined,
  publishedYear: row.published_year ?? undefined,
  pageCount: row.page_count ?? undefined,
  totalChapters: row.total_chapters ?? undefined,
  source: row.source ?? "manual",
  manuallyEdited: Boolean(row.manually_edited),
  status: row.status ?? "proposed",
  featured: row.featured ?? undefined,
  proposalNote: row.proposal_note ?? undefined,
  targetChapter: row.target_chapter ?? undefined,
  targetDate: row.target_date ?? undefined,
  numberChapters: row.number_chapters !== false,
  voteDeadline: row.vote_deadline ? toMillis(row.vote_deadline) : undefined,
  decidedBy: row.decided_by ?? undefined,
  authorUrl: row.author_url ?? undefined,
  meetingAt: row.meeting_at ? toMillis(row.meeting_at) : undefined,
  meetingUrl: row.meeting_url ?? undefined,
  meetingPlace: row.meeting_place ?? undefined,
  createdAt: toMillis(row.created_at)
});

const rowToMemberBook = (row: Record<string, any>): Record<string, any> => ({
  bookId: row.book_id,
  userId: row.user_id,
  shelf: row.shelf ?? "reading",
  chaptersDone: Number(row.chapters_done ?? 0),
  rating: row.rating ?? undefined,
  review: row.review ?? undefined,
  finishedAt: row.finished_at ? toMillis(row.finished_at) : undefined,
  updatedAt: toMillis(row.updated_at)
});

// Mapa id→alias de los miembros activos del club (para resolver autores de
// comentarios y progreso sin múltiples joins).
const clubUserAliasMap = async (communityId: string): Promise<Map<string, string>> => {
  const res = await db
    .from("community_users")
    .select("id,alias")
    .eq("community_id", communityId)
    .eq("status", "active");
  return new Map((res.data ?? []).map((row: Record<string, any>) => [row.id as string, (row.alias as string) ?? "—"]));
};

// Metadatos por miembro para pintar autoría: alias, avatar y un color estable.
// El color es el ORDEN de ingreso (created_at) → cada usuario un color de la paleta
// distinto, repartido automáticamente sin colisiones (la paleta vive en el front).
type ClubUserMeta = { alias: string; avatarUrl?: string; colorIndex: number };
const clubUserMetaMap = async (communityId: string): Promise<Map<string, ClubUserMeta>> => {
  const res = await db
    .from("community_users")
    .select("id,alias,avatar_url,created_at")
    .eq("community_id", communityId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const map = new Map<string, ClubUserMeta>();
  (res.data ?? []).forEach((row: Record<string, any>, i: number) => {
    map.set(row.id as string, { alias: (row.alias as string) ?? "—", avatarUrl: row.avatar_url ?? undefined, colorIndex: i });
  });
  return map;
};

// Recalcula books.status SOLO entre 'reading' y 'finished' (la propuesta la decide la
// votación / el admin, no el progreso). 'finished' cuando TODOS los que lo están
// leyendo lo han terminado (y hay ≥1 lector). Si entra un lector nuevo, vuelve a 'reading'.
// Conjunto de community_users.id ACTIVOS de un club. Excluye a los expulsados/
// salidos (status kicked|left): sus filas quedan (historial) pero no cuentan
// como "gente viva" para votos ni finalización.
const activeMemberIdSet = async (communityId: string): Promise<Set<string>> => {
  const res = await db.from("community_users").select("id").eq("community_id", communityId).eq("status", "active");
  return new Set((res.data ?? []).map((r: Record<string, any>) => String(r.id)));
};

// ¿El usuario global está baneado (permanentemente) de este club? Bloquea reingreso.
const isBanned = async (communityId: string, globalUserId: string): Promise<boolean> => {
  const res = await db.from("community_bans").select("global_user_id").eq("community_id", communityId).eq("global_user_id", globalUserId).maybeSingle();
  return !!res.data;
};

// 403 de baneo localizado (español) e incluyendo el motivo si el admin lo dejó.
const bannedResponse = async (communityId: string, globalUserId: string): Promise<Response> => {
  const res = await db.from("community_bans").select("reason").eq("community_id", communityId).eq("global_user_id", globalUserId).maybeSingle();
  const reason = (res.data?.reason as string | null) ?? null;
  return json(403, {
    code: "banned",
    reason,
    message: reason
      ? `Ya no formas parte de este club. Motivo: ${reason}`
      : "Ya no formas parte de este club."
  });
};

// Inserta notificaciones (best-effort: nunca rompe la acción que las dispara).
const notify = async (
  communityId: string,
  rows: Array<{ user_id: string; kind: string; actor_id?: string | null; book_id?: string | null; text?: string | null }>
): Promise<void> => {
  if (!rows.length) return;
  try {
    await db.from("notifications").insert(
      rows.map((r) => ({
        community_id: communityId,
        user_id: r.user_id,
        actor_id: r.actor_id ?? null,
        kind: r.kind,
        book_id: r.book_id ?? null,
        text: r.text ?? null
      }))
    );
  } catch {
    // best-effort
  }
};

const recomputeBookStatus = async (communityId: string, bookId: string): Promise<string> => {
  const [bookRes, memberRes, active] = await Promise.all([
    db.from("books").select("status").eq("community_id", communityId).eq("id", bookId).maybeSingle(),
    db
      .from("member_books")
      .select("user_id,shelf,chapters_done")
      .eq("community_id", communityId)
      .eq("book_id", bookId),
    activeMemberIdSet(communityId)
  ]);
  const current = (bookRes.data?.status as string) ?? "proposed";
  if (current === "proposed") return "proposed"; // la votación/el admin mueven proposed→reading

  const readers = (memberRes.data ?? [])
    .filter((m: Record<string, any>) => active.has(String(m.user_id)))
    .filter(
      (m: Record<string, any>) => m.shelf === "reading" || m.shelf === "finished" || Number(m.chapters_done ?? 0) > 0
    );
  const allFinished = readers.length > 0 && readers.every((m: Record<string, any>) => m.shelf === "finished");
  const status = allFinished ? "finished" : "reading";
  await db.from("books").update({ status }).eq("community_id", communityId).eq("id", bookId);
  if (current !== "finished" && status === "finished") {
    // El club entero terminó el libro: avisa a todos los activos.
    await notify(communityId, [...active].map((uid) => ({ user_id: uid, kind: "book_finished", book_id: bookId })));
  }
  return status;
};

// Resumen de votos de un libro {yes,no,later} + voto del usuario actual.
const voteSummary = async (
  communityId: string,
  bookId: string,
  userId: string
): Promise<{ yes: number; no: number; later: number; myVote: string | null }> => {
  const [res, active] = await Promise.all([
    db.from("book_votes").select("user_id,vote").eq("community_id", communityId).eq("book_id", bookId),
    activeMemberIdSet(communityId)
  ]);
  const allRows = res.data ?? [];
  // Solo cuentan los votos de miembros ACTIVOS (nada de fantasmas expulsados).
  const rows = allRows.filter((r: Record<string, any>) => active.has(String(r.user_id)));
  return {
    yes: rows.filter((r: Record<string, any>) => r.vote === "yes").length,
    no: rows.filter((r: Record<string, any>) => r.vote === "no").length,
    later: rows.filter((r: Record<string, any>) => r.vote === "later").length,
    myVote: (allRows.find((r: Record<string, any>) => r.user_id === userId)?.vote as string) ?? null
  };
};

// Quórum de decisión de una propuesta: al menos un tercio de los miembros
// activos, mínimo 2. Se mide sobre los VOTOS EMITIDOS, no sobre el censo, para
// que un club con muchos lurkers no se atasque en un limbo permanente.
const PROPOSAL_QUORUM_RATIO = 1 / 3;
const proposalQuorum = (activeCount: number): number =>
  Math.max(2, Math.ceil(activeCount * PROPOSAL_QUORUM_RATIO));

// Decide el resultado de una propuesta. Modo 'majority': alcanzado el quórum de
// votantes, gana la mayoría simple (empate → sigue abierta). Modo 'all':
// unanimidad de los que votaron (cualquier "no" con quórum la descarta). Si la
// propuesta venció su plazo (expired), se resuelve con lo votado (mayoría
// simple; sin votos → se descarta).
const evaluateProposal = (
  yes: number,
  no: number,
  activeCount: number,
  mode: string,
  expired = false
): "reading" | "rejected" | "proposed" => {
  const voters = yes + no;
  const quorum = proposalQuorum(activeCount);
  if (mode === "all") {
    if (voters >= quorum && no === 0 && yes >= quorum) return "reading";
    if (voters >= quorum && no > 0) return "rejected";
  } else if (voters >= quorum) {
    if (yes > no) return "reading";
    if (no > yes) return "rejected";
  }
  if (expired) return yes > no ? "reading" : "rejected";
  return "proposed";
};

// Resuelve perezosamente las propuestas cuyo plazo de votación ya venció (no hay
// cron: lo hacemos al listar). Mejor esfuerzo; nunca rompe la lista.
const resolveExpiredProposals = async (communityId: string): Promise<void> => {
  try {
    const [expiredRes, activeRes, modeRes] = await Promise.all([
      db.from("books").select("id").eq("community_id", communityId).eq("status", "proposed").lt("vote_deadline", nowIso()),
      db.from("community_users").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "active"),
      db.from("communities").select("approval_mode").eq("id", communityId).maybeSingle()
    ]);
    const expired = expiredRes.data ?? [];
    if (expired.length === 0) return;
    const activeCount = activeRes.count ?? 0;
    const mode = (modeRes.data?.approval_mode as string) ?? "majority";
    for (const row of expired) {
      const bookId = String(row.id);
      const summary = await voteSummary(communityId, bookId, "");
      const outcome = evaluateProposal(summary.yes, summary.no, activeCount, mode, true);
      if (outcome === "proposed") continue;
      // El UPDATE actúa de lock: solo aplica si SIGUE 'proposed'. Así, si dos
      // /books/list corren a la vez, solo el primero cambia el estado y notifica
      // (evita book_approved duplicados).
      const upd = await db
        .from("books")
        .update({ status: outcome, decided_by: "deadline" })
        .eq("community_id", communityId)
        .eq("id", bookId)
        .eq("status", "proposed")
        .select("id");
      const won = (upd.data ?? []).length > 0;
      if (won && outcome === "reading") {
        const active = await activeMemberIdSet(communityId);
        await notify(communityId, [...active].map((uid) => ({ user_id: uid, kind: "book_approved", book_id: bookId })));
      }
    }
  } catch {
    // best-effort
  }
};

// Al expulsar/salir un miembro, sus libros pueden pasar a 'finished' (ya no
// bloquea su progreso a medias). Recalcula el estado de los libros que tocaba.
const recomputeMemberBooks = async (communityId: string, memberId: string): Promise<void> => {
  const res = await db.from("member_books").select("book_id").eq("community_id", communityId).eq("user_id", memberId);
  const bookIds = [...new Set((res.data ?? []).map((r: Record<string, any>) => String(r.book_id)))];
  for (const bid of bookIds) await recomputeBookStatus(communityId, bid);
};

// Recalcula member_books de un usuario a partir de sus checkmarks de capítulo.
const recomputeMemberFromChapters = async (
  communityId: string,
  bookId: string,
  userId: string
): Promise<Record<string, any>> => {
  const [totalRes, doneRes] = await Promise.all([
    db.from("book_chapters").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("book_id", bookId),
    db
      .from("chapter_completions")
      .select("chapter_id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("book_id", bookId)
      .eq("user_id", userId)
  ]);
  const total = totalRes.count ?? 0;
  const done = doneRes.count ?? 0;
  const shelf = total > 0 && done >= total ? "finished" : done > 0 ? "reading" : "want";
  const upsert = await db
    .from("member_books")
    .upsert(
      {
        community_id: communityId,
        book_id: bookId,
        user_id: userId,
        shelf,
        chapters_done: done,
        finished_at: shelf === "finished" ? nowIso() : null,
        updated_at: nowIso()
      },
      { onConflict: "community_id,book_id,user_id" }
    )
    .select("*")
    .single();
  return upsert.data ?? {};
};

const buildPostFromRows = (
  row: Record<string, any>,
  comments: Record<string, any>[],
  votes: Record<string, any>[],
  shares: Record<string, any>[],
  opens: Record<string, any>[],
  commentAura: Record<string, any>[]
): Record<string, any> => {
  const postComments = comments
    .filter((entry) => entry.post_id === row.id)
    .sort((a, b) => toMillis(a.created_at) - toMillis(b.created_at))
    .map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      text: entry.text,
      createdAt: toMillis(entry.created_at),
      auraUserIds: commentAura
        .filter((value) => value.comment_id === entry.id)
        .map((value) => value.user_id)
    }));
  const postVotes = votes
    .filter((entry) => entry.post_id === row.id)
    .map((entry) => ({
      userId: entry.user_id,
      vote: entry.vote,
      votedAt: toMillis(entry.voted_at)
    }));
  const contributorCounts: Record<string, number> = {};
  shares
    .filter((entry) => entry.post_id === row.id)
    .forEach((entry) => {
      contributorCounts[entry.user_id] = Math.max(1, Number(entry.share_count ?? 1) || 1);
    });
  if (!contributorCounts[row.user_id]) contributorCounts[row.user_id] = 1;
  const contributorUserIds = Object.keys(contributorCounts);
  const shareCount = Object.values(contributorCounts).reduce((acc, value) => acc + value, 0);
  const openedByUserIds = unique(opens.filter((entry) => entry.post_id === row.id).map((entry) => entry.user_id));

  return {
    id: row.id,
    userId: row.user_id,
    createdAt: toMillis(row.created_at),
    status: row.status ?? "active",
    removedBy: row.removed_by ?? undefined,
    removedAt: row.removed_at ? toMillis(row.removed_at) : undefined,
    removedReason: row.removed_reason ?? undefined,
    url: row.url ?? undefined,
    canonicalUrl: row.canonical_url ?? undefined,
    title: row.title ?? undefined,
    text: row.text ?? undefined,
    previewTitle: row.preview_title ?? undefined,
    previewDescription: row.preview_description ?? undefined,
    previewImageUrl: row.preview_image_url ?? undefined,
    previewSiteName: row.preview_site_name ?? undefined,
    sourceDomain: row.source_domain ?? undefined,
    topics: row.topics && row.topics.length > 0 ? row.topics : ["misc"],
    subtopics: row.subtopics ?? [],
    topicV2: row.topic_v2 ?? undefined,
    topicCandidatesV2: Array.isArray(row.topic_candidates_v2) ? row.topic_candidates_v2 : undefined,
    topicExplanationV2: row.topic_explanation_v2 ?? undefined,
    topicVersion: row.topic_version ?? undefined,
    qualityLabel: row.quality_label,
    qualityScore: Number(row.quality_score ?? 50),
    interestScore: Math.max(1, Math.min(100, Number(row.interest_score ?? 50))),
    flags: row.flags ?? [],
    rationale: row.rationale ?? [],
    normalizedText: row.normalized_text ?? "",
    extractedHosts: [],
    contributorCounts,
    contributorUserIds,
    shareCount,
    openedByUserIds,
    comments: postComments,
    feedbacks: postVotes
  };
};

const postToRow = (postRaw: Record<string, any>, auth: { user: { id: string }; community: { id: string } }): Record<string, any> => {
  const post = normalizePostPayload(postRaw);
  return {
    id: post.id,
    community_id: auth.community.id,
    user_id: post.userId ?? auth.user.id,
    created_at: new Date(Number(post.createdAt ?? Date.now())).toISOString(),
    status: post.status ?? "active",
    removed_by: post.removedBy ?? null,
    removed_at: post.removedAt ? new Date(Number(post.removedAt)).toISOString() : null,
    removed_reason: post.removedReason ?? null,
    url: post.url ?? null,
    canonical_url: post.canonicalUrl ?? null,
    title: post.title ?? null,
    text: post.text ?? null,
    preview_title: post.previewTitle ?? null,
    preview_description: post.previewDescription ?? null,
    preview_image_url: post.previewImageUrl ?? null,
    preview_site_name: post.previewSiteName ?? null,
    source_domain: post.sourceDomain ?? null,
    topics: post.topics,
    subtopics: post.subtopics,
    topic_v2: post.topicV2 ?? null,
    topic_candidates_v2: post.topicCandidatesV2 ?? null,
    topic_explanation_v2: post.topicExplanationV2 ?? null,
    topic_version: post.topicVersion ?? null,
    quality_label: post.qualityLabel ?? "medium",
    quality_score: post.qualityScore,
    interest_score: post.interestScore,
    flags: post.flags,
    rationale: post.rationale,
    normalized_text: post.normalizedText ?? ""
  };
};

const communityNameExists = async (name: string, excludeCommunityId?: string): Promise<boolean> => {
  const normalized = normalizeCommunityName(name);
  if (!normalized) return false;
  const res = await db.from("communities").select("id,name");
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).some((entry: any) => {
    if (excludeCommunityId && String(entry.id) === excludeCommunityId) return false;
    return normalizeCommunityName(String(entry.name ?? "")) === normalized;
  });
};

const syncOwnInteractions = async (auth: { user: { id: string }; community: { id: string } }, post: Record<string, any>) => {
  const postId = String(post.id ?? "").trim();
  if (!postId) return;
  const userId = auth.user.id;
  const feedbacks = Array.isArray(post.feedbacks) ? post.feedbacks : [];
  const ownVote = feedbacks.find((entry: Record<string, any>) => entry.userId === userId);
  if (ownVote) {
    await db.from("post_votes").upsert(
      {
        community_id: auth.community.id,
        post_id: postId,
        user_id: userId,
        vote: ownVote.vote === -1 ? -1 : 1,
        voted_at: new Date(Number(ownVote.votedAt ?? Date.now())).toISOString()
      },
      { onConflict: "community_id,post_id,user_id" }
    );
  }

  const allComments = Array.isArray(post.comments) ? post.comments : [];
  const ownComments = allComments.filter((entry: Record<string, any>) => entry.userId === userId);

  const existingComments = await db
    .from("comments")
    .select("id")
    .eq("community_id", auth.community.id)
    .eq("post_id", postId)
    .eq("user_id", userId);
  const existingIds = new Set((existingComments.data ?? []).map((entry: Record<string, any>) => entry.id as string));
  const keepIds = new Set(ownComments.map((entry: Record<string, any>) => String(entry.id)));
  const removeIds = Array.from(existingIds).filter((id) => !keepIds.has(id));
  if (removeIds.length > 0) {
    await db.from("comments").delete().eq("community_id", auth.community.id).eq("post_id", postId).in("id", removeIds);
  }
  if (ownComments.length > 0) {
    await db.from("comments").upsert(
      ownComments.map((entry: Record<string, any>) => ({
        id: entry.id,
        community_id: auth.community.id,
        post_id: postId,
        user_id: userId,
        text: String(entry.text ?? "").slice(0, 400),
        created_at: new Date(Number(entry.createdAt ?? Date.now())).toISOString()
      })),
      { onConflict: "id" }
    );
  }

  const contributorCounts = (post.contributorCounts ?? {}) as Record<string, number>;
  const shareCount = Math.max(1, Number(contributorCounts[userId] ?? (post.userId === userId ? 1 : 0)) || 0);
  if (shareCount > 0) {
    await db.from("post_shares").upsert(
      {
        community_id: auth.community.id,
        post_id: postId,
        user_id: userId,
        share_count: shareCount,
        last_shared_at: nowIso()
      },
      { onConflict: "community_id,post_id,user_id" }
    );
  }

  const openedBy = new Set(Array.isArray(post.openedByUserIds) ? post.openedByUserIds : []);
  if (openedBy.has(userId)) {
    await db.from("post_opens").upsert(
      {
        community_id: auth.community.id,
        post_id: postId,
        user_id: userId,
        opened_at: nowIso()
      },
      { onConflict: "community_id,post_id,user_id" }
    );
  }

  const ownAuraComments = new Set(
    allComments
      .filter((entry: Record<string, any>) => Array.isArray(entry.auraUserIds) && entry.auraUserIds.includes(userId))
      .map((entry: Record<string, any>) => String(entry.id))
  );
  const allCommentIds = allComments.map((entry: Record<string, any>) => String(entry.id));
  if (allCommentIds.length === 0) return;
  const existingAura = await db
    .from("comment_aura")
    .select("comment_id")
    .eq("community_id", auth.community.id)
    .eq("user_id", userId)
    .in("comment_id", allCommentIds);
  const existingAuraIds = new Set((existingAura.data ?? []).map((entry: Record<string, any>) => String(entry.comment_id)));
  const removeAuraIds = Array.from(existingAuraIds).filter((id) => !ownAuraComments.has(id));
  if (removeAuraIds.length > 0) {
    await db
      .from("comment_aura")
      .delete()
      .eq("community_id", auth.community.id)
      .eq("user_id", userId)
      .in("comment_id", removeAuraIds);
  }
  const insertAura = Array.from(ownAuraComments)
    .filter((id) => !existingAuraIds.has(id))
    .map((commentId) => ({
      community_id: auth.community.id,
      comment_id: commentId,
      user_id: userId,
      created_at: nowIso()
    }));
  if (insertAura.length > 0) {
    await db.from("comment_aura").upsert(insertAura, { onConflict: "community_id,comment_id,user_id" });
  }
};

const ensureCommunityProfileForGlobalUser = async (
  communityId: string,
  globalUser: { id: string; username: string }
): Promise<{ communityUserId: string; alias: string; role: Role }> => {
  const profileRes = await db
    .from("community_profiles")
    .select("community_user_id,display_name")
    .eq("community_id", communityId)
    .eq("user_id", globalUser.id)
    .maybeSingle();
  if (profileRes.error) throw new Error(profileRes.error.message);

  let communityUserId = profileRes.data?.community_user_id as string | undefined;
  let alias = (profileRes.data?.display_name as string | undefined) ?? globalUser.username;

  if (!communityUserId) {
    const normalizedAlias = normalizeAlias(alias);
    const insertedUser = await db
      .from("community_users")
      .insert({
        community_id: communityId,
        alias,
        normalized_alias: normalizedAlias,
        password_hash: "",
        language: "es",
        status: "active",
        global_user_id: globalUser.id
      })
      .select("id,alias")
      .single();
    if (insertedUser.error || !insertedUser.data) {
      throw new Error(insertedUser.error?.message ?? "Could not create community profile user");
    }
    communityUserId = insertedUser.data.id as string;
    alias = insertedUser.data.alias as string;

    const profileInsert = await db.from("community_profiles").insert({
      community_id: communityId,
      user_id: globalUser.id,
      community_user_id: communityUserId,
      display_name: alias,
      display_name_norm: normalizeAlias(alias),
      language: "es"
    });
    if (profileInsert.error) throw new Error(profileInsert.error.message);
  }

  const memberUpsert = await db.from("community_members").upsert(
    {
      community_id: communityId,
      user_id: globalUser.id,
      status: "active"
    },
    { onConflict: "community_id,user_id" }
  );
  if (memberUpsert.error) throw new Error(memberUpsert.error.message);

  const roleRes = await db
    .from("community_user_roles")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", communityUserId)
    .maybeSingle();
  if (roleRes.error) throw new Error(roleRes.error.message);
  const role: Role = (roleRes.data?.role as Role | undefined) ?? "member";
  if (!roleRes.data) {
    const insertRole = await db
      .from("community_user_roles")
      .insert({ community_id: communityId, user_id: communityUserId, role: "member" });
    if (insertRole.error) throw new Error(insertRole.error.message);
  }

  return { communityUserId, alias, role };
};

const createCommunitySession = async (
  communityId: string,
  communityUserId: string
): Promise<{ token: string; expiresAt: string }> => {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const { error } = await db.from("sessions").insert({
    community_id: communityId,
    user_id: communityUserId,
    session_token_hash: tokenHash,
    created_at: nowIso(),
    expires_at: expiresAt
  });
  if (error) throw new Error(error.message);
  return { token, expiresAt };
};

const handlers = {
  "/auth/register_global": async (req: Request) => {
    if (await isRateLimited(`reg:${clientIp(req)}`, 10)) return tooManyAttempts();
    const body = await parseBody(req);
    const username = String(body.username ?? "").trim();
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const password = String(body.password ?? "");
    if (username.length < 2) return bad("username too short");
    if (password.length < 8) return bad("password too short");

    const usernameNorm = normalizeAlias(username);
    const passwordHash = await hashPassword(password);
    const exists = await db
      .from("global_users")
      .select("id")
      .eq("username_norm", usernameNorm)
      .maybeSingle();
    if (exists.error) return dbFail(400, exists.error);
    if (exists.data) return json(409, { message: "USERNAME_EXISTS" });

    const inserted = await db
      .from("global_users")
      .insert({
        username,
        username_norm: usernameNorm,
        email,
        password_hash: passwordHash
      })
      .select("id,username")
      .single();
    if (inserted.error || !inserted.data) return json(400, { message: inserted.error?.message ?? "Register failed" });

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const sErr = await db.from("global_sessions").insert({
      user_id: inserted.data.id,
      session_token_hash: tokenHash,
      created_at: nowIso(),
      expires_at: expiresAt
    });
    if (sErr.error) return dbFail(500, sErr.error);

    return json(
      200,
      {
        session_token: token,
        user: { id: inserted.data.id, username: inserted.data.username },
        settings: { skip_picker: false }
      },
      {
        "Set-Cookie": `wee_global_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
      }
    );
  },

  "/auth/login_global": async (req: Request) => {
    const body = await parseBody(req);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) return bad("username and password required");

    const usernameNorm = normalizeAlias(username);
    // Doble freno: por IP (volumen) y por usuario (ataque dirigido entre IPs).
    if (await isRateLimited(`login_ip:${clientIp(req)}`, 15)) return tooManyAttempts();
    if (await isRateLimited(`login_user:${usernameNorm}`, 8)) return tooManyAttempts();
    const userRes = await db
      .from("global_users")
      .select("id,username,password_hash")
      .eq("username_norm", usernameNorm)
      .maybeSingle();
    if (userRes.error || !userRes.data) return json(401, { message: "Invalid credentials" });
    const verdict = await verifyPassword(password, String(userRes.data.password_hash ?? ""));
    if (!verdict.ok) return json(401, { message: "Invalid credentials" });
    // Migración transparente: re-hash de contraseñas SHA-256 viejas al loguear.
    if (verdict.needsRehash) {
      const fresh = await hashPassword(password);
      await db.from("global_users").update({ password_hash: fresh }).eq("id", userRes.data.id);
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const sErr = await db.from("global_sessions").insert({
      user_id: userRes.data.id,
      session_token_hash: tokenHash,
      created_at: nowIso(),
      expires_at: expiresAt
    });
    if (sErr.error) return dbFail(500, sErr.error);

    const settingsRes = await db
      .from("user_settings")
      .select("default_community_id,skip_picker")
      .eq("user_id", userRes.data.id)
      .maybeSingle();

    return json(
      200,
      {
        session_token: token,
        user: { id: userRes.data.id, username: userRes.data.username },
        settings: settingsRes.data ?? { skip_picker: false }
      },
      {
        "Set-Cookie": `wee_global_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
      }
    );
  },

  "/auth/logout_global": async (req: Request) => {
    const token = extractGlobalSessionToken(req);
    if (token) {
      const tokenHash = await sha256Hex(token);
      await db.from("global_sessions").update({ revoked_at: nowIso() }).eq("session_token_hash", tokenHash).is("revoked_at", null);
    }
    return json(200, { ok: true }, { "Set-Cookie": "wee_global_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax" });
  },

  "/communities/list": async (req: Request) => {
    const globalAuth = await requireGlobalSession(req);
    if (globalAuth instanceof Response) return globalAuth;

    const membershipsRes = await db
      .from("community_members")
      .select("community_id,status")
      .eq("user_id", globalAuth.user.id)
      .eq("status", "active");
    if (membershipsRes.error) return dbFail(500, membershipsRes.error);

    const communityIds = (membershipsRes.data ?? []).map((entry: any) => String(entry.community_id));
    let communityById = new Map<string, { name: string; description?: string }>();
    let roleByCommunityId = new Map<string, Role>();
    let displayNameByCommunityId = new Map<string, string>();

    if (communityIds.length > 0) {
      const [communitiesRes, profilesRes] = await Promise.all([
        db
          .from("communities")
          .select("id,name,description")
          .in("id", communityIds),
        db
          .from("community_profiles")
          .select("community_id,display_name,community_user_id")
          .eq("user_id", globalAuth.user.id)
          .in("community_id", communityIds)
      ]);
      if (communitiesRes.error) return dbFail(500, communitiesRes.error);
      if (profilesRes.error) return dbFail(500, profilesRes.error);

      communityById = new Map(
        (communitiesRes.data ?? []).map((entry: any) => [
          String(entry.id),
          { name: String(entry.name ?? "community"), description: entry.description ?? undefined }
        ])
      );

      const communityUserIds = (profilesRes.data ?? [])
        .map((entry: any) => String(entry.community_user_id))
        .filter(Boolean);

      displayNameByCommunityId = new Map(
        (profilesRes.data ?? []).map((entry: any) => [String(entry.community_id), String(entry.display_name ?? globalAuth.user.username)])
      );

      if (communityUserIds.length > 0) {
        const rolesRes = await db
          .from("community_user_roles")
          .select("community_id,user_id,role")
          .in("community_id", communityIds)
          .in("user_id", communityUserIds);
        if (rolesRes.error) return dbFail(500, rolesRes.error);
        roleByCommunityId = new Map(
          (rolesRes.data ?? []).map((entry: any) => [String(entry.community_id), (entry.role ?? "member") as Role])
        );
      }
    }

    const settingsRes = await db
      .from("user_settings")
      .select("default_community_id,skip_picker")
      .eq("user_id", globalAuth.user.id)
      .maybeSingle();

    return json(200, {
      communities: (membershipsRes.data ?? []).map((entry: any) => {
        const communityId = String(entry.community_id);
        const base = communityById.get(communityId);
        return {
          community_id: communityId,
          name: base?.name ?? "community",
          description: base?.description ?? undefined,
          role: roleByCommunityId.get(communityId) ?? "member",
          display_name: displayNameByCommunityId.get(communityId) ?? globalAuth.user.username
        };
      }),
      settings: settingsRes.data ?? { skip_picker: false }
    });
  },

  "/user/settings/update": async (req: Request) => {
    const globalAuth = await requireGlobalSession(req);
    if (globalAuth instanceof Response) return globalAuth;
    const body = await parseBody(req);
    const payload = {
      user_id: globalAuth.user.id,
      default_community_id: body.default_community_id ? String(body.default_community_id) : null,
      skip_picker: Boolean(body.skip_picker),
      updated_at: nowIso()
    };
    const result = await db.from("user_settings").upsert(payload, { onConflict: "user_id" });
    if (result.error) return dbFail(400, result.error);
    return json(200, { settings: { default_community_id: payload.default_community_id ?? undefined, skip_picker: payload.skip_picker } });
  },

  "/community/enter": async (req: Request) => {
    const globalAuth = await requireGlobalSession(req);
    if (globalAuth instanceof Response) return globalAuth;
    const body = await parseBody(req);
    const communityId = String(body.community_id ?? "").trim();
    if (!communityId) return bad("community_id required");

    const membership = await db
      .from("community_members")
      .select("community_id,status")
      .eq("community_id", communityId)
      .eq("user_id", globalAuth.user.id)
      .maybeSingle();
    if (membership.error || !membership.data || membership.data.status !== "active") {
      return json(403, { message: "Membership required" });
    }

    const profile = await ensureCommunityProfileForGlobalUser(communityId, globalAuth.user);
    const session = await createCommunitySession(communityId, profile.communityUserId);
    const communityRes = await db
      .from("communities")
      .select("id,name,description,rules_text,invite_policy")
      .eq("id", communityId)
      .single();
    if (communityRes.error || !communityRes.data) return json(404, { message: "Community not found" });

    return json(
      200,
      {
        session_token: session.token,
        user: { id: profile.communityUserId, alias: profile.alias, language: "es" },
        community: communityRes.data
      },
      {
        "Set-Cookie": `wee_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
      }
    );
  },

  "/community/create": async (req: Request) => {
    return gone("LEGACY_COMMUNITY_CREATE_DISABLED");
  },

  "/community/create_global": async (req: Request) => {
    const globalAuth = await requireGlobalSession(req);
    if (globalAuth instanceof Response) return globalAuth;
    const body = await parseBody(req);
    const name = String(body.name ?? "").trim();
    if (name.length < 2) return bad("Community name is required");
    const description = String(body.description ?? "").trim() || null;
    const rulesText = String(body.rules_text ?? "").trim() || null;
    const invitePolicy: InvitePolicy = body.invite_policy === "members_allowed" ? "members_allowed" : "admins_only";
    const visibility = ["public", "private", "invite"].includes(body.visibility) ? body.visibility : "public";
    const code = normalizeCode(String(body.code ?? randomCode()));
    const expiresAt = body.invite_expires_at ? new Date(String(body.invite_expires_at)).toISOString() : null;

    try {
      if (await communityNameExists(name)) {
        return json(409, { message: "COMMUNITY_NAME_EXISTS" });
      }
    } catch (error) {
      return json(500, { message: "Could not validate community name" });
    }

    const createCommunityRes = await db
      .from("communities")
      .insert({ name, name_norm: normalizeCommunityName(name), description, rules_text: rulesText, invite_policy: invitePolicy, slug: await uniqueSlug(name), visibility })
      .select("id,name,description,slug,visibility")
      .single();
    if (createCommunityRes.error || !createCommunityRes.data) {
      return json(500, { message: createCommunityRes.error?.message ?? "Create community failed" });
    }
    const communityId = createCommunityRes.data.id as string;

    await ensureCommunityProfileForGlobalUser(communityId, globalAuth.user);
    const profileRes = await db
      .from("community_profiles")
      .select("community_user_id")
      .eq("community_id", communityId)
      .eq("user_id", globalAuth.user.id)
      .single();
    if (profileRes.error || !profileRes.data) return json(500, { message: profileRes.error?.message ?? "Profile create failed" });

    const roleUpsert = await db.from("community_user_roles").upsert(
      { community_id: communityId, user_id: profileRes.data.community_user_id, role: "admin" },
      { onConflict: "community_id,user_id" }
    );
    if (roleUpsert.error) return dbFail(500, roleUpsert.error);
    // El creador es el "admin principal" (owner) del club.
    await db.from("communities").update({ created_by_user_id: profileRes.data.community_user_id }).eq("id", communityId).is("created_by_user_id", null);

    const inviteInsert = await db.from("community_invites").insert({
      community_id: communityId,
      code,
      token: randomToken(),
      created_by: profileRes.data.community_user_id,
      created_at: nowIso(),
      expires_at: expiresAt
    });
    if (inviteInsert.error) return dbFail(500, inviteInsert.error);

    return json(200, {
      community_id: communityId,
      name: createCommunityRes.data.name,
      description: createCommunityRes.data.description ?? undefined
    });
  },

  "/community/preview": async (req: Request) => {
    if (await isRateLimited(`preview:${clientIp(req)}`, 30)) return tooManyAttempts();
    const body = await parseBody(req);
    const code = body.code ? normalizeCode(String(body.code)) : null;
    const token = body.token ? String(body.token).trim() : null;
    if (!code && !token) return bad("code or token required");

    const query = db
      .from("community_invites")
      .select("community_id,created_by,expires_at,revoked_at,communities(name,description)")
      .is("revoked_at", null)
      .limit(1);

    const { data, error } = code ? await query.eq("code", code).maybeSingle() : await query.eq("token", token).maybeSingle();
    if (error || !data) return json(404, { message: "Invite not found" });
    if (data.expires_at && Date.parse(data.expires_at) < Date.now()) return json(410, { message: "Invite expired" });

    const community = data.communities as { name: string; description: string | null };
    let inviter: { alias: string; avatar_url: string | null } | null = null;
    if (data.created_by) {
      const inviterRes = await db
        .from("community_users")
        .select("alias,avatar_url")
        .eq("id", data.created_by)
        .eq("community_id", data.community_id)
        .maybeSingle();
      if (!inviterRes.error && inviterRes.data) inviter = inviterRes.data as { alias: string; avatar_url: string | null };
    }
    return json(200, {
      community_id: data.community_id,
      name: community.name,
      description: community.description ?? undefined,
      inviter: inviter
        ? {
            alias: inviter.alias,
            avatar_url: inviter.avatar_url ?? undefined
          }
        : undefined
    });
  },

  "/community/join/confirm": async (req: Request) => {
    return gone("LEGACY_JOIN_CONFIRM_DISABLED");
  },

  "/community/join/by_invite": async (req: Request) => {
    const globalAuth = await requireGlobalSession(req);
    if (globalAuth instanceof Response) return globalAuth;
    const body = await parseBody(req);
    const code = body.code ? normalizeCode(String(body.code)) : null;
    const token = body.token ? String(body.token).trim() : null;
    if (!code && !token) return bad("code or token required");

    const query = db
      .from("community_invites")
      .select("community_id,expires_at,revoked_at,communities(name,description)")
      .is("revoked_at", null)
      .limit(1);
    const inviteRes = code ? await query.eq("code", code).maybeSingle() : await query.eq("token", token).maybeSingle();
    if (inviteRes.error || !inviteRes.data) return json(404, { message: "Invite not found" });
    if (inviteRes.data.expires_at && Date.parse(inviteRes.data.expires_at) < Date.now()) return json(410, { message: "Invite expired" });

    const communityId = inviteRes.data.community_id as string;
    if (await isBanned(communityId, globalAuth.user.id)) return await bannedResponse(communityId, globalAuth.user.id);
    const memberUpsert = await db.from("community_members").upsert(
      {
        community_id: communityId,
        user_id: globalAuth.user.id,
        status: "active"
      },
      { onConflict: "community_id,user_id" }
    );
    if (memberUpsert.error) return dbFail(400, memberUpsert.error);

    await ensureCommunityProfileForGlobalUser(communityId, globalAuth.user);

    const community = inviteRes.data.communities as { name: string; description: string | null };
    return json(200, {
      community_id: communityId,
      name: community.name,
      description: community.description ?? undefined,
      joined: true
    });
  },

  // Landing pública por slug (sin sesión): escaparate del club.
  "/community/by_slug": async (req: Request) => {
    const body = await parseBody(req);
    const slug = slugify(String(body.slug ?? ""));
    if (!slug) return bad("slug required");
    const { data, error } = await db
      .from("communities")
      .select("id,name,description,visibility,slug")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return json(404, { message: "Community not found" });
    const { count } = await db
      .from("community_users")
      .select("id", { count: "exact", head: true })
      .eq("community_id", data.id)
      .eq("status", "active");
    // Vista previa de caras (hasta 6, más antiguos primero) para que la landing
    // muestre que hay gente de verdad en el club.
    const { data: memberRows } = await db
      .from("community_users")
      .select("alias,avatar_url,created_at")
      .eq("community_id", data.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(6);
    return json(200, {
      community_id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      visibility: data.visibility ?? "public",
      slug: data.slug,
      memberCount: count ?? 0,
      members: (memberRows ?? []).map((m: Record<string, unknown>) => {
        // Solo servimos el avatar si es un thumbnail razonable (~≤60KB). Los
        // avatares legacy full-res (varios MB) caen a iniciales en la landing.
        const url = typeof m.avatar_url === "string" && m.avatar_url.length <= 60_000 ? m.avatar_url : undefined;
        return { alias: String(m.alias ?? ""), avatar_url: url };
      })
    });
  },

  // Unirse a un club PÚBLICO por slug (requiere estar logueado, sin invitación).
  "/community/join_public": async (req: Request) => {
    const globalAuth = await requireGlobalSession(req);
    if (globalAuth instanceof Response) return globalAuth;
    const body = await parseBody(req);
    const slug = slugify(String(body.slug ?? ""));
    if (!slug) return bad("slug required");
    const { data: comm, error } = await db
      .from("communities")
      .select("id,name,description,visibility")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !comm) return json(404, { message: "Community not found" });
    if ((comm.visibility ?? "public") !== "public") return json(403, { message: "Community is not public" });
    if (await isBanned(comm.id, globalAuth.user.id)) return await bannedResponse(comm.id, globalAuth.user.id);
    const memberUpsert = await db.from("community_members").upsert(
      { community_id: comm.id, user_id: globalAuth.user.id, status: "active" },
      { onConflict: "community_id,user_id" }
    );
    if (memberUpsert.error) return dbFail(400, memberUpsert.error);
    await ensureCommunityProfileForGlobalUser(comm.id, globalAuth.user);
    return json(200, {
      community_id: comm.id,
      name: comm.name,
      description: comm.description ?? undefined,
      joined: true
    });
  },

  // Solicitar unirse a un club PRIVADO (requiere login). Público → se une directo;
  // cerrado/invitación → 403 (necesita código).
  "/community/join_request": async (req: Request) => {
    const globalAuth = await requireGlobalSession(req);
    if (globalAuth instanceof Response) return globalAuth;
    const body = await parseBody(req);
    const slug = slugify(String(body.slug ?? ""));
    if (!slug) return bad("slug required");
    const { data: comm, error } = await db
      .from("communities")
      .select("id,name,visibility")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !comm) return json(404, { message: "Community not found" });
    if (await isBanned(comm.id, globalAuth.user.id)) return await bannedResponse(comm.id, globalAuth.user.id);
    const visibility = (comm.visibility ?? "public") as string;

    // Ya es miembro activo → no hace falta solicitar.
    const memberRes = await db
      .from("community_members")
      .select("status")
      .eq("community_id", comm.id)
      .eq("user_id", globalAuth.user.id)
      .maybeSingle();
    if (memberRes.data?.status === "active") return json(200, { joined: true });

    if (visibility === "public") {
      await db.from("community_members").upsert({ community_id: comm.id, user_id: globalAuth.user.id, status: "active" }, { onConflict: "community_id,user_id" });
      await ensureCommunityProfileForGlobalUser(comm.id, globalAuth.user);
      return json(200, { joined: true });
    }
    if (visibility !== "private") return json(403, { message: "Community is invite-only" });

    const up = await db.from("join_requests").upsert(
      { community_id: comm.id, user_id: globalAuth.user.id, status: "pending", created_at: nowIso(), decided_at: null, decided_by: null },
      { onConflict: "community_id,user_id" }
    );
    if (up.error) return dbFail(400, up.error);
    return json(200, { requested: true });
  },

  // Lista de solicitudes pendientes (admin del club).
  "/community/join_request/list": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const { data, error } = await db
      .from("join_requests")
      .select("id,user_id,created_at")
      .eq("community_id", auth.community.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) return dbFail(500, error);
    const rows = data ?? [];
    const ids = rows.map((r: Record<string, any>) => r.user_id);
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const usersRes = await db.from("global_users").select("id,username").in("id", ids);
      (usersRes.data ?? []).forEach((u: Record<string, any>) => names.set(u.id, u.username));
    }
    return json(200, {
      requests: rows.map((r: Record<string, any>) => ({
        id: r.id,
        userId: r.user_id,
        username: names.get(r.user_id) ?? "—",
        createdAt: toMillis(r.created_at)
      }))
    });
  },

  // Aprobar/rechazar una solicitud (admin del club).
  "/community/join_request/decide": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const requestId = String(body.request_id ?? "").trim();
    const approve = body.approve === true;
    if (!requestId) return bad("request_id required");
    const reqRes = await db
      .from("join_requests")
      .select("id,community_id,user_id,status")
      .eq("id", requestId)
      .eq("community_id", auth.community.id)
      .maybeSingle();
    if (reqRes.error || !reqRes.data) return json(404, { message: "Request not found" });
    if (reqRes.data.status !== "pending") return json(409, { message: "Already decided" });

    if (approve) {
      await db.from("community_members").upsert(
        { community_id: auth.community.id, user_id: reqRes.data.user_id, status: "active" },
        { onConflict: "community_id,user_id" }
      );
      const globalUserRes = await db.from("global_users").select("id,username").eq("id", reqRes.data.user_id).maybeSingle();
      if (globalUserRes.data) {
        const profile = await ensureCommunityProfileForGlobalUser(auth.community.id, globalUserRes.data as { id: string; username: string });
        // Avisa al recién aceptado.
        await notify(auth.community.id, [{ user_id: profile.communityUserId, kind: "join_approved", actor_id: auth.user.id }]);
      }
    }
    await db.from("join_requests").update({ status: approve ? "approved" : "rejected", decided_at: nowIso(), decided_by: auth.user.id }).eq("id", requestId);
    return json(200, { ok: true, approved: approve });
  },

  "/auth/register": async (req: Request) => {
    return gone("LEGACY_COMMUNITY_AUTH_DISABLED");
  },

  "/auth/login": async (req: Request) => {
    return gone("LEGACY_COMMUNITY_AUTH_DISABLED");
  },

  "/auth/logout": async (req: Request) => {
    const token = extractSessionToken(req);
    if (token) {
      const tokenHash = await sha256Hex(token);
      await db.from("sessions").update({ revoked_at: nowIso() }).eq("session_token_hash", tokenHash).is("revoked_at", null);
    }
    return json(200, { ok: true }, { "Set-Cookie": "wee_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax" });
  },

  "/community/meta": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const [{ data: members }, commRes] = await Promise.all([
      db
        .from("community_users")
        .select("id,alias,community_user_roles(role)")
        .eq("community_id", auth.community.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      db.from("communities").select("approval_mode,created_by_user_id,book_policy,slug,visibility").eq("id", auth.community.id).maybeSingle()
    ]);

    const memberList = (members ?? []).map((m: any) => ({ id: m.id, alias: m.alias, role: m.community_user_roles?.[0]?.role ?? "member" }));
    // Owner = created_by; si falta (clubs antiguos), el admin más antiguo (members van por created_at asc).
    const ownerId = (commRes.data?.created_by_user_id as string) ?? memberList.find((m) => m.role === "admin")?.id ?? null;

    return json(200, {
      community: {
        id: auth.community.id,
        name: auth.community.name,
        description: auth.community.description ?? "",
        rulesText: auth.community.rules_text ?? "",
        invite_policy: auth.community.invite_policy,
        approval_mode: (commRes.data?.approval_mode as string) ?? "majority",
        book_policy: (commRes.data?.book_policy as string) ?? "members_allowed",
        slug: (commRes.data?.slug as string) ?? null,
        visibility: (commRes.data?.visibility as string) ?? "public",
        ownerId
      },
      members: memberList
    });
  },

  "/community/update": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;

    const body = await parseBody(req);
    const name = body.name !== undefined ? String(body.name).trim().slice(0, 90) : undefined;
    const description = body.description !== undefined ? String(body.description).trim().slice(0, 240) : undefined;
    const rulesText = body.rules_text !== undefined ? String(body.rules_text).trim().slice(0, 4000) : undefined;

    if (name !== undefined && name.length < 2) return bad("Community name too short");
    if (name !== undefined) {
      try {
        if (await communityNameExists(name, auth.community.id)) {
          return json(409, { message: "COMMUNITY_NAME_EXISTS" });
        }
      } catch (error) {
        return json(500, { message: "Could not validate community name" });
      }
    }

    const payload: Record<string, unknown> = {};
    if (name !== undefined) {
      payload.name = name;
      payload.name_norm = normalizeCommunityName(name);
    }
    if (description !== undefined) payload.description = description || null;
    if (rulesText !== undefined) payload.rules_text = rulesText || null;
    if (body.approval_mode === "all" || body.approval_mode === "majority") payload.approval_mode = body.approval_mode;
    if (body.invite_policy === "admins_only" || body.invite_policy === "members_allowed") payload.invite_policy = body.invite_policy;
    if (body.book_policy === "admins_only" || body.book_policy === "members_allowed") payload.book_policy = body.book_policy;
    if (["public", "private", "invite"].includes(body.visibility)) payload.visibility = body.visibility;
    if (body.slug !== undefined) {
      const newSlug = slugify(String(body.slug));
      if (!newSlug || newSlug === "club") return bad("slug invalid");
      const { data: clash } = await db.from("communities").select("id").eq("slug", newSlug).neq("id", auth.community.id).maybeSingle();
      if (clash) return json(409, { message: "SLUG_TAKEN" });
      payload.slug = newSlug;
    }
    if (Object.keys(payload).length === 0) return bad("No changes");

    const { data, error } = await db
      .from("communities")
      .update(payload)
      .eq("id", auth.community.id)
      .select("id,name,description,rules_text,invite_policy,approval_mode,book_policy,slug,visibility")
      .single();
    if (error || !data) return json(400, { message: error?.message ?? "Community update failed" });

    return json(200, {
      community: {
        id: data.id,
        name: data.name,
        description: data.description ?? undefined,
        rules_text: data.rules_text ?? undefined,
        invite_policy: data.invite_policy,
        approval_mode: data.approval_mode ?? "majority",
        book_policy: data.book_policy ?? "members_allowed",
        slug: data.slug ?? null,
        visibility: data.visibility ?? "public"
      }
    });
  },

  "/community/leave": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;

    if (auth.role === "admin") {
      const { count } = await db
        .from("community_user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("community_id", auth.community.id)
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return json(400, { message: "Last admin cannot leave. Promote another admin first." });
      }
    }

    await db.from("sessions").update({ revoked_at: nowIso() }).eq("user_id", auth.user.id).eq("community_id", auth.community.id).is("revoked_at", null);
    await db.from("community_users").update({ status: "left" }).eq("id", auth.user.id).eq("community_id", auth.community.id);
    const globalLink = await db
      .from("community_users")
      .select("global_user_id")
      .eq("id", auth.user.id)
      .eq("community_id", auth.community.id)
      .maybeSingle();
    if (globalLink.data?.global_user_id) {
      await db
        .from("community_members")
        .update({ status: "left" })
        .eq("community_id", auth.community.id)
        .eq("user_id", globalLink.data.global_user_id);
    }
    await recomputeMemberBooks(auth.community.id, auth.user.id); // sus lecturas a medias ya no bloquean 'finished'
    return json(200, { ok: true });
  },

  "/community/admin/promote": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    // Solo el owner gestiona el equipo de admins (evita escaladas entre admins).
    if ((await ownerOf(auth.community.id)) !== auth.user.id) return json(403, { message: "Solo el fundador del club puede nombrar admins" });

    const body = await parseBody(req);
    const target = String(body.target_user_id ?? "").trim();
    if (!target) return bad("target_user_id required");
    const targetUser = await db
      .from("community_users")
      .select("id,status")
      .eq("community_id", auth.community.id)
      .eq("id", target)
      .maybeSingle();
    if (targetUser.error || !targetUser.data || targetUser.data.status !== "active") {
      return json(404, { message: "Target user not found in this community" });
    }

    await db.from("community_user_roles").upsert({ community_id: auth.community.id, user_id: target, role: "admin" }, { onConflict: "community_id,user_id" });
    await notify(auth.community.id, [{ user_id: target, kind: "promoted", actor_id: auth.user.id }]);
    return json(200, { ok: true });
  },

  "/community/admin/demote": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;

    const body = await parseBody(req);
    const target = String(body.target_user_id ?? "").trim();
    // Solo el owner gestiona roles admin (salvo autodegradarse, que se permite abajo).
    if (target !== auth.user.id && (await ownerOf(auth.community.id)) !== auth.user.id) {
      return json(403, { message: "Solo el fundador del club puede cambiar roles de admin" });
    }
    if (!target) return bad("target_user_id required");
    const targetUser = await db
      .from("community_users")
      .select("id,status")
      .eq("community_id", auth.community.id)
      .eq("id", target)
      .maybeSingle();
    if (targetUser.error || !targetUser.data || targetUser.data.status !== "active") {
      return json(404, { message: "Target user not found in this community" });
    }

    const ownerId = await ownerOf(auth.community.id);
    if (ownerId && target === ownerId && auth.user.id !== ownerId) {
      return json(403, { message: "Cannot demote the club owner" });
    }

    if (target === auth.user.id) {
      const { count } = await db
        .from("community_user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("community_id", auth.community.id)
        .eq("role", "admin");
      if ((count ?? 0) <= 1) return json(400, { message: "Cannot demote last admin" });
    }

    await db.from("community_user_roles").upsert({ community_id: auth.community.id, user_id: target, role: "member" }, { onConflict: "community_id,user_id" });
    return json(200, { ok: true });
  },

  "/community/admin/remove": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;

    const body = await parseBody(req);
    const target = String(body.target_user_id ?? "").trim();
    if (!target) return bad("target_user_id required");

    const ownerId = await ownerOf(auth.community.id);
    if (ownerId && target === ownerId && auth.user.id !== ownerId) {
      return json(403, { message: "Cannot remove the club owner" });
    }

    const { data: targetRole } = await db
      .from("community_user_roles")
      .select("role")
      .eq("community_id", auth.community.id)
      .eq("user_id", target)
      .maybeSingle();

    if (targetRole?.role === "admin") {
      const { count } = await db
        .from("community_user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("community_id", auth.community.id)
        .eq("role", "admin");
      if ((count ?? 0) <= 1) return json(400, { message: "Cannot remove last admin" });
    }

    await db.from("community_users").update({ status: "kicked" }).eq("id", target).eq("community_id", auth.community.id);
    await db.from("sessions").update({ revoked_at: nowIso() }).eq("user_id", target).eq("community_id", auth.community.id).is("revoked_at", null);
    await recomputeMemberBooks(auth.community.id, target); // sus lecturas a medias ya no bloquean 'finished'
    return json(200, { ok: true });
  },

  // Banear (permanente): expulsa + registra el baneo → el usuario no puede volver.
  "/community/admin/ban": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const target = String(body.target_user_id ?? "").trim();
    if (!target) return bad("target_user_id required");
    const memberRes = await db.from("community_users").select("id,global_user_id").eq("community_id", auth.community.id).eq("id", target).maybeSingle();
    if (memberRes.error || !memberRes.data?.global_user_id) return json(404, { message: "Member not found" });
    const globalUserId = memberRes.data.global_user_id as string;
    // No banear a otro admin (protege al equipo; degrádalo primero).
    const { data: targetRole } = await db.from("community_user_roles").select("role").eq("community_id", auth.community.id).eq("user_id", target).maybeSingle();
    if (targetRole?.role === "admin") return json(400, { message: "Demote the admin before banning" });
    const banReason = body.reason ? String(body.reason).trim().slice(0, 300) : null;
    await db.from("community_bans").upsert({ community_id: auth.community.id, global_user_id: globalUserId, created_at: nowIso(), created_by: auth.user.id, reason: banReason }, { onConflict: "community_id,global_user_id" });
    await db.from("community_users").update({ status: "kicked" }).eq("id", target).eq("community_id", auth.community.id);
    await db.from("community_members").update({ status: "kicked" }).eq("community_id", auth.community.id).eq("user_id", globalUserId);
    await db.from("sessions").update({ revoked_at: nowIso() }).eq("user_id", target).eq("community_id", auth.community.id).is("revoked_at", null);
    // Retira en cascada los comentarios del baneado (el texto tóxico ya no queda a la vista).
    await db
      .from("book_comments")
      .update({ deleted_at: nowIso(), text: "", moderated: true })
      .eq("community_id", auth.community.id)
      .eq("user_id", target)
      .is("deleted_at", null);
    await recomputeMemberBooks(auth.community.id, target);
    return json(200, { ok: true, banned: true });
  },

  "/community/admin/unban": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const globalUserId = String(body.global_user_id ?? "").trim();
    if (!globalUserId) return bad("global_user_id required");
    await db.from("community_bans").delete().eq("community_id", auth.community.id).eq("global_user_id", globalUserId);
    return json(200, { ok: true, banned: false });
  },

  // Silencio temporal: escalón previo al baneo. minutes por defecto 60.
  "/community/admin/mute": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const target = String(body.target_user_id ?? "").trim();
    if (!target) return bad("target_user_id required");
    const minutes = Number.isFinite(Number(body.minutes)) ? Math.min(10080, Math.max(1, Math.floor(Number(body.minutes)))) : 60;
    // No silenciar a un admin.
    const { data: targetRole } = await db.from("community_user_roles").select("role").eq("community_id", auth.community.id).eq("user_id", target).maybeSingle();
    if (targetRole?.role === "admin") return json(400, { message: "No puedes silenciar a un admin" });
    const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const upd = await db.from("community_users").update({ muted_until: until }).eq("community_id", auth.community.id).eq("id", target);
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { ok: true, mutedUntil: toMillis(until) });
  },

  "/community/admin/unmute": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const target = String(body.target_user_id ?? "").trim();
    if (!target) return bad("target_user_id required");
    const upd = await db.from("community_users").update({ muted_until: null }).eq("community_id", auth.community.id).eq("id", target);
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { ok: true });
  },

  "/community/bans/list": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const res = await db.from("community_bans").select("global_user_id,created_at").eq("community_id", auth.community.id).order("created_at", { ascending: false });
    const ids = (res.data ?? []).map((r: Record<string, any>) => r.global_user_id);
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const usersRes = await db.from("global_users").select("id,username").in("id", ids);
      (usersRes.data ?? []).forEach((u: Record<string, any>) => names.set(u.id, u.username));
    }
    return json(200, {
      bans: (res.data ?? []).map((r: Record<string, any>) => ({ globalUserId: r.global_user_id, username: names.get(r.global_user_id) ?? "—", createdAt: r.created_at }))
    });
  },

  "/community/invite/create": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    if (!canManageInvites(auth.role, auth.community.invite_policy)) {
      return json(403, { message: "Invite policy forbids this action" });
    }

    const body = await parseBody(req);
    const code = normalizeCode(String(body.code ?? randomCode()));
    const token = randomToken();
    const expiresAt = body.expires_at ? new Date(String(body.expires_at)).toISOString() : null;

    const { data, error } = await db
      .from("community_invites")
      .insert({
        community_id: auth.community.id,
        code,
        token,
        created_by: auth.user.id,
        created_at: nowIso(),
        expires_at: expiresAt
      })
      .select("id,code,token")
      .single();
    if (error || !data) return json(400, { message: error?.message ?? "Invite create failed" });
    return json(200, { id: data.id, code: data.code, token: data.token, link: buildInviteUrl(data.code) });
  },

  "/community/invite/revoke": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    if (!canManageInvites(auth.role, auth.community.invite_policy)) {
      return json(403, { message: "Invite policy forbids this action" });
    }
    const body = await parseBody(req);
    const inviteId = String(body.invite_id ?? "").trim();
    if (!inviteId) return bad("invite_id required");

    await db
      .from("community_invites")
      .update({ revoked_at: nowIso() })
      .eq("id", inviteId)
      .eq("community_id", auth.community.id)
      .is("revoked_at", null);
    return json(200, { ok: true });
  },

  "/community/invite/set_expiry": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    if (!canManageInvites(auth.role, auth.community.invite_policy)) {
      return json(403, { message: "Invite policy forbids this action" });
    }
    const body = await parseBody(req);
    const inviteId = String(body.invite_id ?? "").trim();
    if (!inviteId) return bad("invite_id required");
    const expiresAt = body.expires_at ? new Date(String(body.expires_at)).toISOString() : null;

    await db
      .from("community_invites")
      .update({ expires_at: expiresAt })
      .eq("id", inviteId)
      .eq("community_id", auth.community.id)
      .is("revoked_at", null);
    return json(200, { ok: true });
  },

  "/community/invite/list": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    if (!canManageInvites(auth.role, auth.community.invite_policy)) {
      return json(403, { message: "Invite policy forbids this action" });
    }
    // Solo códigos vivos (no revocados). El cliente sabe si están caducados por expires_at.
    const { data } = await db
      .from("community_invites")
      .select("id,code,expires_at,created_at")
      .eq("community_id", auth.community.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    return json(200, {
      invites: (data ?? []).map((i: Record<string, unknown>) => ({
        id: i.id,
        code: i.code,
        expiresAt: i.expires_at ?? null,
        createdAt: i.created_at ?? null
      }))
    });
  },

  "/data/bootstrap": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const requestedLimit = Number(body.limit ?? 80);
    const pageLimit = Number.isFinite(requestedLimit)
      ? Math.max(20, Math.min(200, Math.floor(requestedLimit)))
      : 80;
    const cursorCreatedAt = String(body.cursor_created_at ?? "").trim();
    const includeUsers = body.include_users !== false;
    const includePreferences = body.include_preferences !== false;
    const includePosts = body.include_posts !== false; // el club de lectura no usa posts

    const usersPromise = includeUsers
      ? db
          .from("community_users")
          .select("id,alias,avatar_url,language,created_at,community_user_roles(role)")
          .eq("community_id", auth.community.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as const);

    let postsQuery = db
      .from("posts")
      .select("id,user_id,created_at,status,removed_by,removed_at,removed_reason,url,canonical_url,title,text,preview_title,preview_description,preview_image_url,preview_site_name,source_domain,topics,subtopics,topic_v2,topic_candidates_v2,topic_explanation_v2,topic_version,quality_label,quality_score,interest_score,flags,rationale,normalized_text")
      .eq("community_id", auth.community.id)
      .order("created_at", { ascending: false })
      .limit(pageLimit + 1);
    if (cursorCreatedAt) {
      postsQuery = postsQuery.lt("created_at", cursorCreatedAt);
    }

    const prefsPromise = includePreferences
      ? db
          .from("user_preferences")
          .select("user_id,preferred_topics,blocked_domains,blocked_keywords")
          .eq("community_id", auth.community.id)
          .eq("user_id", auth.user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const);

    const postsPromise = includePosts ? postsQuery : Promise.resolve({ data: [], error: null } as const);
    const [usersRes, postsRes, prefsRes] = await Promise.all([usersPromise, postsPromise, prefsPromise]);

    if (usersRes.error) return dbFail(500, usersRes.error);
    if (postsRes.error) return dbFail(500, postsRes.error);

    const rawPosts = (postsRes.data ?? []) as Record<string, any>[];
    const hasMore = rawPosts.length > pageLimit;
    const pageRows = hasMore ? rawPosts.slice(0, pageLimit) : rawPosts;
    const nextCursor = hasMore ? String(pageRows[pageRows.length - 1]?.created_at ?? "") : null;
    const postIds = pageRows.map((post: Record<string, any>) => post.id);
    let comments: Record<string, any>[] = [];
    let votes: Record<string, any>[] = [];
    let shares: Record<string, any>[] = [];
    let opens: Record<string, any>[] = [];
    let commentAura: Record<string, any>[] = [];
    if (postIds.length > 0) {
      const [commentsRes, votesRes, sharesRes, opensRes] = await Promise.all([
        db
          .from("comments")
          .select("id,post_id,user_id,text,created_at")
          .eq("community_id", auth.community.id)
          .in("post_id", postIds),
        db
          .from("post_votes")
          .select("post_id,user_id,vote,voted_at")
          .eq("community_id", auth.community.id)
          .in("post_id", postIds),
        db
          .from("post_shares")
          .select("post_id,user_id,share_count")
          .eq("community_id", auth.community.id)
          .in("post_id", postIds),
        db
          .from("post_opens")
          .select("post_id,user_id")
          .eq("community_id", auth.community.id)
          .in("post_id", postIds)
      ]);
      if (commentsRes.error) return dbFail(500, commentsRes.error);
      if (votesRes.error) return dbFail(500, votesRes.error);
      if (sharesRes.error) return dbFail(500, sharesRes.error);
      if (opensRes.error) return dbFail(500, opensRes.error);

      comments = commentsRes.data ?? [];
      votes = votesRes.data ?? [];
      shares = sharesRes.data ?? [];
      opens = opensRes.data ?? [];

      const commentIds = comments.map((entry) => entry.id);
      if (commentIds.length > 0) {
        const commentAuraRes = await db
          .from("comment_aura")
          .select("comment_id,user_id")
          .eq("community_id", auth.community.id)
          .in("comment_id", commentIds);
        if (commentAuraRes.error) return dbFail(500, commentAuraRes.error);
        commentAura = commentAuraRes.data ?? [];
      }
    }

    return json(200, {
      users: (usersRes.data ?? []).map((row) => rowToCommunityUser(row as Record<string, any>)),
      posts: pageRows.map((row) =>
        buildPostFromRows(
          row as Record<string, any>,
          comments,
          votes,
          shares,
          opens,
          commentAura
        )
      ),
      preferences: prefsRes.data
        ? {
            userId: auth.user.id,
            preferredTopics: prefsRes.data.preferred_topics ?? [],
            blockedDomains: prefsRes.data.blocked_domains ?? [],
            blockedKeywords: prefsRes.data.blocked_keywords ?? []
          }
        : null
      ,
      next_cursor: nextCursor || null,
      has_more: hasMore
    });
  },

  "/data/post/create": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const post = normalizePostPayload((body.post ?? {}) as Record<string, any>);
    // Id de fila generado en SERVIDOR: no se confía en el del cliente (evita
    // squatting de PK e ids predecibles). Se devuelve en la respuesta.
    post.id = crypto.randomUUID();

    const row = postToRow({ ...post, userId: auth.user.id }, auth);
    const { error } = await db.from("posts").insert(row);
    if (error) return dbFail(400, error);

    await syncOwnInteractions(auth, { ...post, userId: auth.user.id });
    return json(200, { ...post, userId: auth.user.id });
  },

  "/data/post/update": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const post = normalizePostPayload((body.post ?? {}) as Record<string, any>);
    const postId = String(post.id ?? "").trim();
    if (!postId) return bad("post.id required");

    const current = await db
      .from("posts")
      .select("id,user_id,community_id")
      .eq("id", postId)
      .eq("community_id", auth.community.id)
      .maybeSingle();
    if (current.error || !current.data) return json(404, { message: "Post not found" });
    if (current.data.user_id !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Not allowed to edit this post" });
    }

    const row = postToRow({ ...post, userId: current.data.user_id }, auth);
    const { error } = await db.from("posts").update(row).eq("id", postId).eq("community_id", auth.community.id);
    if (error) return dbFail(400, error);

    await syncOwnInteractions(auth, { ...post, userId: current.data.user_id });
    return json(200, { ...post, userId: current.data.user_id });
  },

  "/data/post/delete": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const postId = String(body.post_id ?? "").trim();
    if (!postId) return bad("post_id required");
    const current = await db
      .from("posts")
      .select("id,user_id")
      .eq("id", postId)
      .eq("community_id", auth.community.id)
      .maybeSingle();
    if (current.error || !current.data) return json(404, { message: "Post not found" });
    if (current.data.user_id !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Not allowed to delete this post" });
    }
    const { error } = await db.from("posts").delete().eq("id", postId).eq("community_id", auth.community.id);
    if (error) return dbFail(400, error);
    return json(200, { ok: true });
  },

  "/data/preferences/get": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const { data, error } = await db
      .from("user_preferences")
      .select("preferred_topics,blocked_domains,blocked_keywords")
      .eq("community_id", auth.community.id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) return dbFail(500, error);
    if (!data) return json(200, null);
    return json(200, {
      userId: auth.user.id,
      preferredTopics: data.preferred_topics ?? [],
      blockedDomains: data.blocked_domains ?? [],
      blockedKeywords: data.blocked_keywords ?? []
    });
  },

  "/data/preferences/upsert": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const prefs = (body.preferences ?? {}) as Record<string, any>;
    const payload = {
      community_id: auth.community.id,
      user_id: auth.user.id,
      preferred_topics: Array.isArray(prefs.preferredTopics) ? prefs.preferredTopics.slice(0, 30) : [],
      blocked_domains: Array.isArray(prefs.blockedDomains) ? prefs.blockedDomains.slice(0, 50) : [],
      blocked_keywords: Array.isArray(prefs.blockedKeywords) ? prefs.blockedKeywords.slice(0, 80) : [],
      updated_at: nowIso()
    };
    const { error } = await db.from("user_preferences").upsert(payload, { onConflict: "community_id,user_id" });
    if (error) return dbFail(400, error);
    return json(200, {
      userId: auth.user.id,
      preferredTopics: payload.preferred_topics,
      blockedDomains: payload.blocked_domains,
      blockedKeywords: payload.blocked_keywords
    });
  },

  "/data/report/create": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const postId = String(body.post_id ?? "").trim();
    const reason = String(body.reason ?? "").trim().slice(0, 280);
    if (!postId || !reason) return bad("post_id and reason required");
    const { error } = await db.from("post_reports").insert({
      community_id: auth.community.id,
      post_id: postId,
      reporter_id: auth.user.id,
      reason,
      created_at: nowIso()
    });
    if (error) return dbFail(400, error);
    return json(200, { ok: true });
  },

  "/data/profile/update": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const alias = body.alias ? String(body.alias).trim().slice(0, 40) : null;
    const avatarUrl = body.avatar_url === undefined ? undefined : String(body.avatar_url ?? "").trim() || null;
    const language = body.language && ["es", "en", "gl"].includes(String(body.language)) ? String(body.language) : undefined;

    if (alias) {
      const normalized = normalizeAlias(alias);
      const exists = await db
        .from("community_users")
        .select("id")
        .eq("community_id", auth.community.id)
        .eq("normalized_alias", normalized)
        .neq("id", auth.user.id)
        .limit(1);
      if ((exists.data ?? []).length > 0) return json(409, { message: "Alias already exists" });
    }

    const updatePayload: Record<string, unknown> = {};
    if (alias !== null) {
      updatePayload.alias = alias;
      updatePayload.normalized_alias = normalizeAlias(alias);
    }
    if (avatarUrl !== undefined) updatePayload.avatar_url = avatarUrl;
    if (language) updatePayload.language = language;
    if (Object.keys(updatePayload).length > 0) {
      const { error } = await db
        .from("community_users")
        .update(updatePayload)
        .eq("community_id", auth.community.id)
        .eq("id", auth.user.id);
      if (error) return dbFail(400, error);
    }

    const { data: updated, error: readError } = await db
      .from("community_users")
      .select("id,alias,avatar_url,language,created_at,community_user_roles(role)")
      .eq("community_id", auth.community.id)
      .eq("id", auth.user.id)
      .single();
    if (readError) return dbFail(500, readError);
    return json(200, { user: rowToCommunityUser(updated as Record<string, any>) });
  },

  // Feed de actividad del club para la home: comentarios, anotaciones, capítulos
  // leídos y propuestas de las ÚLTIMAS 24 HORAS, mezclados por fecha. Cada evento
  // trae el actor (alias + color + avatar) para pintarlo. Es la "tira" de la home.
  "/community/activity": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Una sola tanda en paralelo (antes había 2 round-trips extra: metaMap y títulos
    // dependientes). Los títulos del club son pocos → se traen enteros de golpe.
    const [commentsRes, notesRes, readsRes, proposalsRes, booksRes, metaMap] = await Promise.all([
      db.from("book_comments").select("id,user_id,book_id,text,created_at").eq("community_id", auth.community.id).is("deleted_at", null).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
      db.from("chapter_notes").select("user_id,book_id,created_at").eq("community_id", auth.community.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20),
      db.from("chapter_completions").select("user_id,book_id,completed_at").eq("community_id", auth.community.id).gte("completed_at", since).order("completed_at", { ascending: false }).limit(20),
      db.from("books").select("id,added_by,title,created_at").eq("community_id", auth.community.id).gte("created_at", since).order("created_at", { ascending: false }).limit(15),
      db.from("books").select("id,title").eq("community_id", auth.community.id).limit(500),
      clubUserMetaMap(auth.community.id)
    ]);
    const titleById = new Map((booksRes.data ?? []).map((b: Record<string, any>) => [b.id, b.title ?? ""]));
    const actor = (uid: string) => {
      const m = metaMap.get(uid);
      return { actorAlias: m?.alias ?? "—", actorAvatarUrl: m?.avatarUrl ?? null, actorColorIndex: m?.colorIndex ?? null };
    };
    const events: Array<Record<string, any>> = [];
    (commentsRes.data ?? []).forEach((c: Record<string, any>) => events.push({ kind: "comment", ...actor(c.user_id), bookId: c.book_id, bookTitle: titleById.get(c.book_id) ?? "", commentId: c.id, text: String(c.text ?? "").slice(0, 120), at: toMillis(c.created_at) }));
    (notesRes.data ?? []).forEach((n: Record<string, any>) => events.push({ kind: "note", ...actor(n.user_id), bookId: n.book_id, bookTitle: titleById.get(n.book_id) ?? "", at: toMillis(n.created_at) }));
    (readsRes.data ?? []).forEach((r: Record<string, any>) => events.push({ kind: "read", ...actor(r.user_id), bookId: r.book_id, bookTitle: titleById.get(r.book_id) ?? "", at: toMillis(r.completed_at) }));
    (proposalsRes.data ?? []).forEach((b: Record<string, any>) => events.push({ kind: "proposal", ...actor(b.added_by), bookId: b.id, bookTitle: b.title ?? "", at: toMillis(b.created_at) }));
    // Solo actores activos (los expulsados quedan como "—") y reciente primero.
    const clean = events.filter((e) => e.actorAlias !== "—").sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    return json(200, { events: clean.slice(0, 30) });
  },

  // Salud del club (solo admin): por miembro, cuánto participa y cuándo fue su
  // última señal de vida. Ayuda al organizador a ver quién se engancha y quién se apaga.
  "/community/health": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const [membersRes, votesRes, commentsRes, mbRes] = await Promise.all([
      db.from("community_users").select("id,alias,created_at").eq("community_id", auth.community.id).eq("status", "active"),
      db.from("book_votes").select("user_id").eq("community_id", auth.community.id),
      db.from("book_comments").select("user_id,created_at").eq("community_id", auth.community.id).is("deleted_at", null),
      db.from("member_books").select("user_id,shelf,updated_at").eq("community_id", auth.community.id)
    ]);
    const votesBy: Record<string, number> = {};
    (votesRes.data ?? []).forEach((v: Record<string, any>) => { votesBy[v.user_id] = (votesBy[v.user_id] ?? 0) + 1; });
    const commentsBy: Record<string, number> = {};
    const lastBy: Record<string, number> = {};
    (commentsRes.data ?? []).forEach((c: Record<string, any>) => {
      commentsBy[c.user_id] = (commentsBy[c.user_id] ?? 0) + 1;
      lastBy[c.user_id] = Math.max(lastBy[c.user_id] ?? 0, toMillis(c.created_at));
    });
    const readingBy: Record<string, number> = {};
    const finishedBy: Record<string, number> = {};
    (mbRes.data ?? []).forEach((m: Record<string, any>) => {
      if (m.shelf === "reading") readingBy[m.user_id] = (readingBy[m.user_id] ?? 0) + 1;
      if (m.shelf === "finished") finishedBy[m.user_id] = (finishedBy[m.user_id] ?? 0) + 1;
      if (m.updated_at) lastBy[m.user_id] = Math.max(lastBy[m.user_id] ?? 0, toMillis(m.updated_at));
    });
    const members = (membersRes.data ?? []).map((m: Record<string, any>) => ({
      id: m.id,
      alias: m.alias,
      votes: votesBy[m.id] ?? 0,
      comments: commentsBy[m.id] ?? 0,
      reading: readingBy[m.id] ?? 0,
      finished: finishedBy[m.id] ?? 0,
      lastActive: lastBy[m.id] ?? null,
      joinedAt: toMillis(m.created_at)
    }));
    // Los que más se apagan primero (sin señal reciente).
    members.sort((a, b) => (a.lastActive ?? 0) - (b.lastActive ?? 0));
    return json(200, { members });
  },

  // Recordatorio del organizador: avisa a los miembros activos que aún no votaron
  // la propuesta indicada (o, sin book_id, que hay propuestas abiertas por votar).
  "/community/remind": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    if (await isRateLimited(`remind:${auth.community.id}`, 6, 3600)) return slowDown();
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const active = await activeMemberIdSet(auth.community.id);
    const votedRes = await db.from("book_votes").select("user_id").eq("community_id", auth.community.id).eq("book_id", bookId);
    const voted = new Set((votedRes.data ?? []).map((v: Record<string, any>) => String(v.user_id)));
    const targets = [...active].filter((uid) => uid !== auth.user.id && !voted.has(uid));
    await notify(auth.community.id, targets.map((uid) => ({ user_id: uid, kind: "reminder", actor_id: auth.user.id, book_id: bookId })));
    return json(200, { ok: true, reminded: targets.length });
  },

  // Recordatorio de ritmo: avisa a quien va por debajo de la meta de capítulos.
  // Lo puede lanzar el facilitador (quien propuso) o un admin.
  "/community/remind_reading": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    if (await isRateLimited(`remind:${auth.community.id}`, 6, 3600)) return slowDown();
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const bookRes = await db.from("books").select("id,added_by,target_chapter").eq("community_id", auth.community.id).eq("id", bookId).maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    if (bookRes.data.added_by !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Solo quien propuso el libro (o un admin) puede recordar el ritmo" });
    }
    const target = Number(bookRes.data.target_chapter ?? 0);
    if (!target) return json(400, { message: "No hay meta de capítulos fijada" });
    const active = await activeMemberIdSet(auth.community.id);
    const mbRes = await db.from("member_books").select("user_id,chapters_done").eq("community_id", auth.community.id).eq("book_id", bookId);
    const doneBy = new Map((mbRes.data ?? []).map((m: Record<string, any>) => [String(m.user_id), Number(m.chapters_done ?? 0)]));
    // Rezagados = activos (menos el que avisa) cuyo progreso < meta.
    const targets = [...active].filter((uid) => uid !== auth.user.id && (doneBy.get(uid) ?? 0) < target);
    await notify(auth.community.id, targets.map((uid) => ({ user_id: uid, kind: "reminder", actor_id: auth.user.id, book_id: bookId })));
    return json(200, { ok: true, reminded: targets.length });
  },

  // ───────────────────────────── Club de lectura: libros ─────────────────────────
  "/books/list": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    // Sin cron: al listar, resolvemos las propuestas cuyo plazo ya venció.
    await resolveExpiredProposals(auth.community.id);
    const [booksRes, memberRes, votesRes, active] = await Promise.all([
      db
        .from("books")
        .select("*")
        .eq("community_id", auth.community.id)
        .order("created_at", { ascending: false }),
      db
        .from("member_books")
        .select("book_id,user_id,shelf,chapters_done,rating,review,finished_at,updated_at")
        .eq("community_id", auth.community.id),
      db
        .from("book_votes")
        .select("book_id,user_id,vote")
        .eq("community_id", auth.community.id),
      activeMemberIdSet(auth.community.id)
    ]);
    if (booksRes.error) return dbFail(500, booksRes.error);
    if (memberRes.error) return dbFail(500, memberRes.error);
    if (votesRes.error) return dbFail(500, votesRes.error);

    const voteByBook: Record<string, { yes: number; no: number; later: number; myVote: string | null }> = {};
    (votesRes.data ?? []).forEach((row: Record<string, any>) => {
      const v = (voteByBook[row.book_id] = voteByBook[row.book_id] ?? { yes: 0, no: 0, later: 0, myVote: null });
      if (row.user_id === auth.user.id) v.myVote = row.vote; // el caller siempre es activo
      if (!active.has(String(row.user_id))) return; // no contar votos de miembros kicked/left
      if (row.vote === "yes") v.yes += 1;
      else if (row.vote === "no") v.no += 1;
      else if (row.vote === "later") v.later += 1;
    });

    // Estadísticas agregadas por libro (nota media, lectores activos, última actividad).
    // Solo miembros ACTIVOS: nada de fantasmas expulsados/salidos inflando conteos.
    const statsByBook: Record<string, { ratings: number[]; readers: number; lastActivityAt: number }> = {};
    const allMembers = memberRes.data ?? [];
    allMembers.forEach((row: Record<string, any>) => {
      if (!active.has(String(row.user_id))) return;
      const s = (statsByBook[row.book_id] = statsByBook[row.book_id] ?? { ratings: [], readers: 0, lastActivityAt: 0 });
      if (typeof row.rating === "number") s.ratings.push(row.rating);
      if (row.shelf === "reading" || row.shelf === "finished" || Number(row.chapters_done ?? 0) > 0) s.readers += 1;
      s.lastActivityAt = Math.max(s.lastActivityAt, toMillis(row.updated_at));
    });

    return json(200, {
      books: (booksRes.data ?? []).map((row) => {
        const id = (row as Record<string, any>).id;
        const s = statsByBook[id];
        return {
          ...rowToBook(row as Record<string, any>),
          votes: voteByBook[id] ?? { yes: 0, no: 0, later: 0, myVote: null },
          stats: {
            avgRating: s && s.ratings.length > 0 ? Math.round((s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length) * 10) / 10 : null,
            ratingCount: s ? s.ratings.length : 0,
            readers: s ? s.readers : 0,
            lastActivityAt: s && s.lastActivityAt > 0 ? s.lastActivityAt : null
          }
        };
      }),
      memberBooks: allMembers
        .filter((row: Record<string, any>) => row.user_id === auth.user.id)
        .map((row: Record<string, any>) => rowToMemberBook(row))
    });
  },

  "/books/create": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    // Regla del club: si book_policy = admins_only, solo admins proponen libros.
    if (auth.role !== "admin") {
      const polRes = await db.from("communities").select("book_policy").eq("id", auth.community.id).maybeSingle();
      if ((polRes.data?.book_policy as string) === "admins_only") {
        return json(403, { message: "Only admins can add books in this club" });
      }
    }
    const body = await parseBody(req);
    const b = (body.book ?? {}) as Record<string, any>;
    const title = String(b.title ?? "").trim().slice(0, 300);
    if (!title) return bad("title required");
    const source = ["google_books", "open_library", "manual"].includes(b.source) ? b.source : "manual";
    const row = {
      community_id: auth.community.id,
      added_by: auth.user.id,
      isbn: b.isbn ? String(b.isbn).trim().slice(0, 32) : null,
      title,
      author: b.author ? String(b.author).trim().slice(0, 200) : null,
      cover_url: b.coverUrl ? String(b.coverUrl).trim() : null,
      description: b.description ? String(b.description).trim().slice(0, 4000) : null,
      published_year: Number.isFinite(Number(b.publishedYear)) ? Number(b.publishedYear) : null,
      page_count: Number.isFinite(Number(b.pageCount)) ? Number(b.pageCount) : null,
      total_chapters: Number.isFinite(Number(b.totalChapters)) ? Number(b.totalChapters) : null,
      source,
      manually_edited: Boolean(b.manuallyEdited),
      status: "proposed",
      proposal_note: b.proposalNote ? String(b.proposalNote).trim().slice(0, 400) : null,
      author_url: safeHttpUrl(b.authorUrl),
      // Plazo de votación: 7 días. Al vencer, resolveExpiredProposals la decide.
      vote_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    const ins = await db.from("books").insert(row).select("*").single();
    if (ins.error) {
      if (ins.error.message.toLowerCase().includes("duplicate")) {
        return json(409, { message: "BOOK_ALREADY_IN_CLUB" });
      }
      return dbFail(400, ins.error);
    }
    // Quien propone el libro vota "sí" por defecto (lo propuso, lo quiere leer).
    await db.from("book_votes").upsert(
      { community_id: auth.community.id, book_id: ins.data.id, user_id: auth.user.id, vote: "yes", created_at: nowIso() },
      { onConflict: "book_id,user_id" }
    );
    // Avisa a los demás activos: hay una propuesta que votar (sin esto, el
    // quórum es inalcanzable porque nadie se entera).
    const active = await activeMemberIdSet(auth.community.id);
    await notify(
      auth.community.id,
      [...active]
        .filter((uid) => uid !== auth.user.id)
        .map((uid) => ({ user_id: uid, kind: "book_proposed", actor_id: auth.user.id, book_id: ins.data.id }))
    );
    return json(200, { book: rowToBook(ins.data as Record<string, any>) });
  },

  "/books/get": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");

    const bookRes = await db
      .from("books")
      .select("*")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error) return dbFail(500, bookRes.error);
    if (!bookRes.data) return json(404, { message: "Book not found" });

    const [commentsRes, membersRes, chaptersRes, completionsRes, notesRes, metaMap] = await Promise.all([
      db
        .from("book_comments")
        .select("id,user_id,text,parent_id,chapter_id,note_id,phase,pinned_at,created_at,edited_at,deleted_at,moderated")
        .eq("community_id", auth.community.id)
        .eq("book_id", bookId)
        .order("created_at", { ascending: true }),
      db
        .from("member_books")
        .select("*")
        .eq("community_id", auth.community.id)
        .eq("book_id", bookId),
      db
        .from("book_chapters")
        .select("id,idx,title")
        .eq("community_id", auth.community.id)
        .eq("book_id", bookId)
        .order("idx", { ascending: true }),
      db
        .from("chapter_completions")
        .select("chapter_id,user_id")
        .eq("community_id", auth.community.id)
        .eq("book_id", bookId),
      db
        .from("chapter_notes")
        .select("id,chapter_id,user_id,kind,text,image_url,created_at,edited_at")
        .eq("community_id", auth.community.id)
        .eq("book_id", bookId)
        .order("created_at", { ascending: true }),
      clubUserMetaMap(auth.community.id)
    ]);
    if (commentsRes.error) return dbFail(500, commentsRes.error);
    if (membersRes.error) return dbFail(500, membersRes.error);
    if (chaptersRes.error) return dbFail(500, chaptersRes.error);
    if (completionsRes.error) return dbFail(500, completionsRes.error);
    if (notesRes.error) return dbFail(500, notesRes.error);

    const members = (membersRes.data ?? []).map((row: Record<string, any>) => ({
      ...rowToMemberBook(row),
      alias: metaMap.get(row.user_id)?.alias ?? "—"
    }));

    const completions = completionsRes.data ?? [];
    const countByChapter: Record<string, number> = {};
    const readersByChapter: Record<string, { id: string; alias: string }[]> = {};
    const mineSet = new Set<string>();
    completions.forEach((row: Record<string, any>) => {
      countByChapter[row.chapter_id] = (countByChapter[row.chapter_id] ?? 0) + 1;
      (readersByChapter[row.chapter_id] = readersByChapter[row.chapter_id] ?? []).push({ id: row.user_id, alias: metaMap.get(row.user_id)?.alias ?? "—" });
      if (row.user_id === auth.user.id) mineSet.add(row.chapter_id);
    });
    const notesByChapter: Record<string, any[]> = {};
    (notesRes.data ?? []).forEach((row: Record<string, any>) => {
      (notesByChapter[row.chapter_id] = notesByChapter[row.chapter_id] ?? []).push({
        id: row.id,
        userId: row.user_id ?? undefined,
        alias: metaMap.get(row.user_id)?.alias ?? "—",
        kind: row.kind ?? "note",
        text: row.text,
        imageUrl: row.image_url ?? undefined,
        createdAt: toMillis(row.created_at),
        editedAt: row.edited_at ? toMillis(row.edited_at) : undefined
      });
    });
    const chapters = (chaptersRes.data ?? []).map((row: Record<string, any>) => ({
      id: row.id,
      idx: row.idx,
      title: row.title,
      doneByMe: mineSet.has(row.id),
      completedCount: countByChapter[row.id] ?? 0,
      readers: readersByChapter[row.id] ?? [],
      notes: notesByChapter[row.id] ?? []
    }));

    const votes = await voteSummary(auth.community.id, bookId, auth.user.id);
    const commentIds = (commentsRes.data ?? []).map((r: Record<string, any>) => r.id);
    const noteIds = (notesRes.data ?? []).map((r: Record<string, any>) => r.id);
    const [memberCountRes, reactionsRes, noteReactionsRes] = await Promise.all([
      db
        .from("community_users")
        .select("id", { count: "exact", head: true })
        .eq("community_id", auth.community.id)
        .eq("status", "active"),
      commentIds.length > 0
        ? db.from("comment_reactions").select("comment_id,user_id,emoji").in("comment_id", commentIds)
        : Promise.resolve({ data: [], error: null } as const),
      noteIds.length > 0
        ? db.from("note_reactions").select("note_id,user_id,emoji").in("note_id", noteIds)
        : Promise.resolve({ data: [], error: null } as const)
    ]);
    const activeMemberCount = memberCountRes.count ?? 0;
    const reactionsByComment: Record<string, Record<string, { emoji: string; count: number; mine: boolean }>> = {};
    (reactionsRes.data ?? []).forEach((r: Record<string, any>) => {
      const byEmoji = (reactionsByComment[r.comment_id] = reactionsByComment[r.comment_id] ?? {});
      const e = (byEmoji[r.emoji] = byEmoji[r.emoji] ?? { emoji: r.emoji, count: 0, mine: false });
      e.count += 1;
      if (r.user_id === auth.user.id) e.mine = true;
    });
    // Adjuntar reacciones a cada anotación (las refs viven también en `chapters`).
    const reactionsByNote: Record<string, Record<string, { emoji: string; count: number; mine: boolean }>> = {};
    (noteReactionsRes.data ?? []).forEach((r: Record<string, any>) => {
      const byEmoji = (reactionsByNote[r.note_id] = reactionsByNote[r.note_id] ?? {});
      const e = (byEmoji[r.emoji] = byEmoji[r.emoji] ?? { emoji: r.emoji, count: 0, mine: false });
      e.count += 1;
      if (r.user_id === auth.user.id) e.mine = true;
    });
    Object.values(notesByChapter).forEach((arr) => arr.forEach((n: Record<string, any>) => {
      n.reactions = Object.values(reactionsByNote[n.id] ?? {});
    }));
    // RSVP de la cita (quién va).
    const rsvpRes = await db.from("book_meeting_rsvp").select("user_id,status").eq("community_id", auth.community.id).eq("book_id", bookId);
    const rsvpRows = rsvpRes.data ?? [];
    const meetingRsvp = {
      going: rsvpRows.filter((r: Record<string, any>) => r.status === "yes").length,
      mine: (rsvpRows.find((r: Record<string, any>) => r.user_id === auth.user.id)?.status as string) ?? null,
      goingAliases: rsvpRows.filter((r: Record<string, any>) => r.status === "yes").map((r: Record<string, any>) => metaMap.get(r.user_id)?.alias ?? "—").slice(0, 8)
    };
    return json(200, {
      activeMemberCount,
      meetingRsvp,
      clubMembers: Array.from(metaMap, ([id, m]) => ({ id, alias: m.alias, avatarUrl: m.avatarUrl, colorIndex: m.colorIndex })),
      book: rowToBook(bookRes.data as Record<string, any>),
      comments: (commentsRes.data ?? []).map((row: Record<string, any>) => {
        const deleted = !!row.deleted_at;
        return {
          id: row.id,
          userId: row.user_id,
          alias: metaMap.get(row.user_id)?.alias ?? "—",
          text: deleted ? "" : row.text,
          parentId: row.parent_id ?? undefined,
          chapterId: row.chapter_id ?? undefined,
          noteId: row.note_id ?? undefined,
          phase: (row.phase as string) ?? "reading",
          pinned: !!row.pinned_at,
          reactions: deleted ? [] : Object.values(reactionsByComment[row.id] ?? {}),
          createdAt: toMillis(row.created_at),
          editedAt: row.edited_at ? toMillis(row.edited_at) : undefined,
          deleted,
          moderated: !!row.moderated
        };
      }),
      members,
      myMember: members.find((m: Record<string, any>) => m.userId === auth.user.id) ?? null,
      chapters,
      votes
    });
  },

  "/books/comment": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    // Anti-flood: máx. 20 comentarios por minuto y usuario.
    if (await isRateLimited(`comment:${auth.user.id}`, 20, 60)) return slowDown();
    const cMuted = await mutedGate(auth.community.id, auth.user.id);
    if (cMuted) return cMuted;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    const text = String(body.text ?? "").trim().slice(0, 2000);
    const parentId = body.parent_id ? String(body.parent_id).trim() : null;
    let chapterId = body.chapter_id ? String(body.chapter_id).trim() : null;
    const noteId = body.note_id ? String(body.note_id).trim() : null;
    if (!bookId) return bad("book_id required");
    if (!text) return bad("text required");

    // Hilo "sobre una anotación": ancla el comentario al capítulo de la nota.
    let noteAuthorId: string | null = null;
    if (noteId) {
      const noteRes = await db
        .from("chapter_notes")
        .select("id,chapter_id,user_id")
        .eq("community_id", auth.community.id)
        .eq("id", noteId)
        .maybeSingle();
      if (noteRes.data?.chapter_id) chapterId = noteRes.data.chapter_id as string;
      noteAuthorId = (noteRes.data?.user_id as string) ?? null;
    }

    const bookRes = await db
      .from("books")
      .select("id,title,status")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    // Fase del comentario = estado del libro al escribirlo (proposed vs reading/finished).
    // Permite plegar la discusión de propuesta al aprobar sin duplicar secciones.
    const commentPhase = (bookRes.data.status as string) === "proposed" ? "proposed" : "reading";

    // Validar que el padre pertenece al mismo libro/club (y no anidar más de 1 nivel).
    let parentAuthorId: string | null = null;
    if (parentId) {
      const parentRes = await db
        .from("book_comments")
        .select("id,book_id,user_id")
        .eq("community_id", auth.community.id)
        .eq("id", parentId)
        .maybeSingle();
      if (parentRes.error || !parentRes.data || parentRes.data.book_id !== bookId) {
        return json(404, { message: "Parent comment not found" });
      }
      parentAuthorId = parentRes.data.user_id ?? null;
    }

    const ins = await db
      .from("book_comments")
      .insert({ community_id: auth.community.id, book_id: bookId, user_id: auth.user.id, text, parent_id: parentId, chapter_id: chapterId, note_id: noteId, phase: commentPhase })
      .select("id,user_id,text,parent_id,chapter_id,note_id,phase,created_at")
      .single();
    if (ins.error) return dbFail(400, ins.error);

    // Voto propio por defecto (estilo Reddit): el autor arranca con +1.
    await db.from("comment_reactions").upsert(
      { community_id: auth.community.id, comment_id: ins.data.id, user_id: auth.user.id, emoji: "up", created_at: nowIso() },
      { onConflict: "comment_id,user_id,emoji" }
    );

    // ── Notificaciones (sanas: solo dirigidas a ti): @menciones + respuesta ──
    try {
      const notified = new Set<string>([auth.user.id]); // nunca te notificas a ti mismo
      const recipients: { user_id: string; kind: string }[] = [];

      const tokens = [...text.matchAll(/@([\p{L}\p{N}_.\-]+)/gu)].map((m) =>
        m[1].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      );
      if (tokens.length > 0) {
        const usersRes = await db
          .from("community_users")
          .select("id,normalized_alias")
          .eq("community_id", auth.community.id)
          .eq("status", "active");
        const keyToId = new Map<string, string>();
        (usersRes.data ?? []).forEach((u: Record<string, any>) => {
          const norm = String(u.normalized_alias ?? "");
          keyToId.set(norm, u.id);
          keyToId.set(norm.replace(/\s+/g, ""), u.id);
        });
        tokens.forEach((tok) => {
          const id = keyToId.get(tok);
          if (id && !notified.has(id)) {
            notified.add(id);
            recipients.push({ user_id: id, kind: "mention" });
          }
        });
      }
      if (parentAuthorId && !notified.has(parentAuthorId)) {
        notified.add(parentAuthorId);
        recipients.push({ user_id: parentAuthorId, kind: "reply" });
      }
      // Comentario en la nota de alguien: avisa al autor de la nota (si no es él mismo ni ya notificado).
      if (noteAuthorId && noteAuthorId !== auth.user.id && !notified.has(noteAuthorId)) {
        notified.add(noteAuthorId);
        recipients.push({ user_id: noteAuthorId, kind: "note_comment" });
      }
      if (recipients.length > 0) {
        await db.from("notifications").insert(
          recipients.map((r) => ({
            community_id: auth.community.id,
            user_id: r.user_id,
            actor_id: auth.user.id,
            kind: r.kind,
            book_id: bookId,
            comment_id: ins.data.id,
            text: text.slice(0, 140)
          }))
        );
      }
    } catch (_e) {
      // las notificaciones son best-effort; no romper el comentario
    }

    return json(200, {
      comment: {
        id: ins.data.id,
        userId: ins.data.user_id,
        alias: auth.user.alias,
        text: ins.data.text,
        parentId: ins.data.parent_id ?? undefined,
        chapterId: ins.data.chapter_id ?? undefined,
        noteId: ins.data.note_id ?? undefined,
        phase: (ins.data.phase as string) ?? "reading",
        reactions: [{ emoji: "up", count: 1, mine: true }],
        createdAt: toMillis(ins.data.created_at)
      }
    });
  },

  // Reacción emoji a un comentario (toggle). Para agradecer/resonar, sin leaderboard.
  "/comments/react": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const commentId = String(body.comment_id ?? "").trim();
    const emoji = String(body.emoji ?? "").trim();
    if (!commentId) return bad("comment_id required");
    if (!["up", "down"].includes(emoji)) return bad("emoji must be up or down");
    const rMuted = await mutedGate(auth.community.id, auth.user.id);
    if (rMuted) return rMuted;

    const cRes = await db
      .from("book_comments")
      .select("id,user_id,book_id")
      .eq("community_id", auth.community.id)
      .eq("id", commentId)
      .maybeSingle();
    if (cRes.error || !cRes.data) return json(404, { message: "Comment not found" });

    // Sin maybeSingle: un usuario podría tener filas up Y down (datos legacy o carrera),
    // y maybeSingle petaría con 2 filas. Contamos y decidimos.
    const existing = await db
      .from("comment_reactions")
      .select("emoji")
      .eq("comment_id", commentId)
      .eq("user_id", auth.user.id);
    if ((existing.data ?? []).length > 0) {
      // Ya tenías voto (igual u opuesto): este clic te devuelve a 0 (nunca +1 → -1).
      await db.from("comment_reactions").delete().eq("comment_id", commentId).eq("user_id", auth.user.id);
    } else {
      await db.from("comment_reactions").upsert(
        { community_id: auth.community.id, comment_id: commentId, user_id: auth.user.id, emoji, created_at: nowIso() },
        { onConflict: "comment_id,user_id,emoji" }
      );
      // Avisa al autor cuando le dan un "up" (la gasolina social). Nunca en "down" ni a uno mismo.
      const author = String(cRes.data.user_id);
      if (emoji === "up" && author !== auth.user.id) {
        await notify(auth.community.id, [{ user_id: author, kind: "reaction", actor_id: auth.user.id, book_id: cRes.data.book_id ?? null }]);
      }
    }
    // Devolver el recuento actualizado de ese comentario.
    const all = await db.from("comment_reactions").select("emoji,user_id").eq("comment_id", commentId);
    const byEmoji: Record<string, { emoji: string; count: number; mine: boolean }> = {};
    (all.data ?? []).forEach((r: Record<string, any>) => {
      const e = (byEmoji[r.emoji] = byEmoji[r.emoji] ?? { emoji: r.emoji, count: 0, mine: false });
      e.count += 1;
      if (r.user_id === auth.user.id) e.mine = true;
    });
    return json(200, { commentId, reactions: Object.values(byEmoji) });
  },

  // Editar una anotación propia (texto/tipo/enlace). Deja marca de editado.
  "/chapters/note/update": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const noteId = String(body.note_id ?? "").trim();
    const text = String(body.text ?? "").trim().slice(0, 4000);
    if (!noteId) return bad("note_id required");
    const imageUrl = body.image_url !== undefined ? safeHttpUrl(body.image_url) : undefined;
    const kind = ["note", "reference", "prompt"].includes(body.kind) ? body.kind : undefined;

    const cur = await db
      .from("chapter_notes")
      .select("id,user_id")
      .eq("community_id", auth.community.id)
      .eq("id", noteId)
      .maybeSingle();
    if (cur.error || !cur.data) return json(404, { message: "Note not found" });
    if (cur.data.user_id !== auth.user.id) return json(403, { message: "Not your note" });

    const patch: Record<string, any> = { edited_at: nowIso() };
    if (text || imageUrl !== undefined) patch.text = text;
    if (imageUrl !== undefined) patch.image_url = imageUrl;
    if (kind) patch.kind = kind;
    const upd = await db
      .from("chapter_notes")
      .update(patch)
      .eq("community_id", auth.community.id)
      .eq("id", noteId)
      .select("id,chapter_id,user_id,kind,text,image_url,created_at,edited_at")
      .single();
    if (upd.error) return dbFail(400, upd.error);
    return json(200, {
      note: {
        id: upd.data.id,
        chapterId: upd.data.chapter_id,
        userId: upd.data.user_id ?? undefined,
        alias: auth.user.alias,
        kind: upd.data.kind ?? "note",
        text: upd.data.text,
        imageUrl: upd.data.image_url ?? undefined,
        createdAt: toMillis(upd.data.created_at),
        editedAt: upd.data.edited_at ? toMillis(upd.data.edited_at) : undefined
      }
    });
  },

  // Borrar una anotación (propia o admin). Los hilos que la encabezaban quedan como
  // comentarios normales (FK note_id → set null).
  "/chapters/note/delete": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const noteId = String(body.note_id ?? "").trim();
    if (!noteId) return bad("note_id required");
    const cur = await db
      .from("chapter_notes")
      .select("id,user_id")
      .eq("community_id", auth.community.id)
      .eq("id", noteId)
      .maybeSingle();
    if (cur.error || !cur.data) return json(404, { message: "Note not found" });
    if (cur.data.user_id !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Not allowed to delete this note" });
    }
    const del = await db.from("chapter_notes").delete().eq("community_id", auth.community.id).eq("id", noteId);
    if (del.error) return dbFail(400, del.error);
    return json(200, { ok: true });
  },

  // Reacción emoji a una ANOTACIÓN (toggle). Mismo modelo que comentarios.
  "/chapters/note/react": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const noteId = String(body.note_id ?? "").trim();
    const emoji = String(body.emoji ?? "").trim();
    if (!noteId) return bad("note_id required");
    if (!["up", "down"].includes(emoji)) return bad("emoji must be up or down");

    const nRes = await db
      .from("chapter_notes")
      .select("id")
      .eq("community_id", auth.community.id)
      .eq("id", noteId)
      .maybeSingle();
    if (nRes.error || !nRes.data) return json(404, { message: "Note not found" });

    const existing = await db
      .from("note_reactions")
      .select("emoji")
      .eq("note_id", noteId)
      .eq("user_id", auth.user.id)
      .eq("emoji", emoji)
      .maybeSingle();
    if (existing.data) {
      await db.from("note_reactions").delete().eq("note_id", noteId).eq("user_id", auth.user.id).eq("emoji", emoji);
    } else {
      // Un solo voto por usuario.
      await db.from("note_reactions").delete().eq("note_id", noteId).eq("user_id", auth.user.id);
      await db.from("note_reactions").upsert(
        { community_id: auth.community.id, note_id: noteId, user_id: auth.user.id, emoji, created_at: nowIso() },
        { onConflict: "note_id,user_id,emoji" }
      );
    }
    const all = await db.from("note_reactions").select("emoji,user_id").eq("note_id", noteId);
    const byEmoji: Record<string, { emoji: string; count: number; mine: boolean }> = {};
    (all.data ?? []).forEach((r: Record<string, any>) => {
      const e = (byEmoji[r.emoji] = byEmoji[r.emoji] ?? { emoji: r.emoji, count: 0, mine: false });
      e.count += 1;
      if (r.user_id === auth.user.id) e.mine = true;
    });
    return json(200, { noteId, reactions: Object.values(byEmoji) });
  },

  // Editar tu propio comentario.
  "/comments/update": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const commentId = String(body.comment_id ?? "").trim();
    const text = String(body.text ?? "").trim().slice(0, 2000);
    if (!commentId) return bad("comment_id required");
    if (!text) return bad("text required");
    const cur = await db
      .from("book_comments")
      .select("id,user_id")
      .eq("community_id", auth.community.id)
      .eq("id", commentId)
      .maybeSingle();
    if (cur.error || !cur.data) return json(404, { message: "Comment not found" });
    if (cur.data.user_id !== auth.user.id) return json(403, { message: "Not your comment" });
    // Editar un comentario destacado le quita el destacado: evita el "bait-and-switch"
    // (lograr el pin con algo bueno y reescribirlo a otra cosa).
    const upd = await db
      .from("book_comments")
      .update({ text, edited_at: nowIso(), pinned_at: null })
      .eq("community_id", auth.community.id)
      .eq("id", commentId)
      .select("id,text,edited_at")
      .single();
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { id: upd.data.id, text: upd.data.text, editedAt: upd.data.edited_at ? toMillis(upd.data.edited_at) : undefined });
  },

  // Borrar un comentario (propio o admin). Borra en cascada respuestas y reacciones.
  "/comments/delete": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const commentId = String(body.comment_id ?? "").trim();
    if (!commentId) return bad("comment_id required");
    const cur = await db
      .from("book_comments")
      .select("id,user_id")
      .eq("community_id", auth.community.id)
      .eq("id", commentId)
      .maybeSingle();
    if (cur.error || !cur.data) return json(404, { message: "Comment not found" });
    if (cur.data.user_id !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Not allowed to delete this comment" });
    }
    // Si tiene respuestas, borrado SUAVE (lápida) para no romper el hilo; si no, borrado real.
    const kids = await db
      .from("book_comments")
      .select("id", { count: "exact", head: true })
      .eq("community_id", auth.community.id)
      .eq("parent_id", commentId);
    const hasReplies = (kids.count ?? 0) > 0;
    if (hasReplies) {
      const soft = await db
        .from("book_comments")
        // moderated = lo retira un admin que no es el autor (lápida honesta).
        .update({ deleted_at: nowIso(), text: "", moderated: cur.data.user_id !== auth.user.id })
        .eq("community_id", auth.community.id)
        .eq("id", commentId);
      if (soft.error) return dbFail(400, soft.error);
      return json(200, { ok: true, mode: "soft" });
    }
    const del = await db.from("book_comments").delete().eq("community_id", auth.community.id).eq("id", commentId);
    if (del.error) return dbFail(400, del.error);
    return json(200, { ok: true, mode: "hard" });
  },

  // Destacar / quitar destacado de un comentario (solo admin). Toggle de pinned_at.
  "/comments/pin": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const commentId = String(body.comment_id ?? "").trim();
    if (!commentId) return bad("comment_id required");
    const pinned = body.pinned === true;
    const upd = await db
      .from("book_comments")
      .update({ pinned_at: pinned ? nowIso() : null })
      .eq("community_id", auth.community.id)
      .eq("id", commentId)
      .is("deleted_at", null);
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { ok: true, pinned });
  },

  // Cualquier miembro puede denunciar un comentario (palanca que no es "discutir más").
  "/comments/report": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    if (await isRateLimited(`report:${auth.user.id}`, 10, 3600)) return slowDown();
    const body = await parseBody(req);
    const commentId = String(body.comment_id ?? "").trim();
    if (!commentId) return bad("comment_id required");
    const reason = body.reason ? String(body.reason).trim().slice(0, 300) : null;
    const cRes = await db.from("book_comments").select("id,user_id").eq("community_id", auth.community.id).eq("id", commentId).maybeSingle();
    if (cRes.error || !cRes.data) return json(404, { message: "Comment not found" });
    if (cRes.data.user_id === auth.user.id) return json(400, { message: "No puedes denunciar tu propio comentario" });
    const ins = await db.from("comment_reports").upsert(
      { community_id: auth.community.id, comment_id: commentId, reporter_id: auth.user.id, reason, created_at: nowIso(), resolved_at: null },
      { onConflict: "community_id,comment_id,reporter_id" }
    );
    if (ins.error) return dbFail(400, ins.error);
    return json(200, { ok: true });
  },

  // Cola de moderación: denuncias abiertas del club (solo admin).
  "/community/reports/list": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const repRes = await db
      .from("comment_reports")
      .select("id,comment_id,reporter_id,reason,created_at")
      .eq("community_id", auth.community.id)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    const reports = repRes.data ?? [];
    const commentIds = [...new Set(reports.map((r: Record<string, any>) => r.comment_id))];
    const aliasMap = await clubUserAliasMap(auth.community.id);
    const commentsRes = commentIds.length
      ? await db.from("book_comments").select("id,user_id,text,book_id,deleted_at").eq("community_id", auth.community.id).in("id", commentIds)
      : { data: [] as Record<string, any>[] };
    const byId = new Map((commentsRes.data ?? []).map((c: Record<string, any>) => [c.id, c]));
    return json(200, {
      reports: reports.map((r: Record<string, any>) => {
        const c = byId.get(r.comment_id) as Record<string, any> | undefined;
        return {
          id: r.id,
          commentId: r.comment_id,
          bookId: c?.book_id ?? null,
          reason: r.reason ?? null,
          reporterAlias: aliasMap.get(r.reporter_id) ?? "—",
          authorAlias: c ? (aliasMap.get(c.user_id) ?? "—") : "—",
          text: c?.deleted_at ? "" : (c?.text ?? ""),
          deleted: !!c?.deleted_at,
          createdAt: toMillis(r.created_at)
        };
      })
    });
  },

  "/community/reports/resolve": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const commentId = String(body.comment_id ?? "").trim();
    if (!commentId) return bad("comment_id required");
    const upd = await db.from("comment_reports").update({ resolved_at: nowIso() }).eq("community_id", auth.community.id).eq("comment_id", commentId);
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { ok: true });
  },


  "/books/progress": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");

    const bookRes = await db
      .from("books")
      .select("id,total_chapters")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });

    const total = bookRes.data.total_chapters as number | null;
    let chaptersDone = Math.max(0, Math.floor(Number(body.chapters_done ?? 0)) || 0);
    if (total && chaptersDone > total) chaptersDone = total;
    // El estante deriva del progreso salvo que se pase explícito.
    const finished = total ? chaptersDone >= total : false;
    const shelf = ["want", "reading", "finished"].includes(body.shelf)
      ? body.shelf
      : finished
        ? "finished"
        : chaptersDone > 0
          ? "reading"
          : "want";

    const upsert = await db
      .from("member_books")
      .upsert(
        {
          community_id: auth.community.id,
          book_id: bookId,
          user_id: auth.user.id,
          shelf,
          chapters_done: chaptersDone,
          finished_at: shelf === "finished" ? nowIso() : null,
          updated_at: nowIso()
        },
        { onConflict: "community_id,book_id,user_id" }
      )
      .select("*")
      .single();
    if (upsert.error) return dbFail(400, upsert.error);

    const status = await recomputeBookStatus(auth.community.id, bookId);
    return json(200, { myMember: rowToMemberBook(upsert.data as Record<string, any>), bookStatus: status });
  },

  "/books/finish": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const rating = body.rating === undefined || body.rating === null ? null : Math.max(1, Math.min(5, Math.floor(Number(body.rating))));
    const review = body.review ? String(body.review).trim().slice(0, 4000) : null;

    const bookRes = await db
      .from("books")
      .select("id,total_chapters")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    const total = bookRes.data.total_chapters as number | null;

    const upsert = await db
      .from("member_books")
      .upsert(
        {
          community_id: auth.community.id,
          book_id: bookId,
          user_id: auth.user.id,
          shelf: "finished",
          chapters_done: total ?? 0,
          rating,
          review,
          finished_at: nowIso(),
          updated_at: nowIso()
        },
        { onConflict: "community_id,book_id,user_id" }
      )
      .select("*")
      .single();
    if (upsert.error) return dbFail(400, upsert.error);

    const status = await recomputeBookStatus(auth.community.id, bookId);
    return json(200, { myMember: rowToMemberBook(upsert.data as Record<string, any>), bookStatus: status });
  },

  "/books/set_chapters": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const totalChapters = Number.isFinite(Number(body.total_chapters)) ? Math.max(0, Math.floor(Number(body.total_chapters))) : null;

    const bookRes = await db
      .from("books")
      .select("id,added_by")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    if (bookRes.data.added_by !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Only the member who added the book (or an admin) can set chapters" });
    }

    const upd = await db
      .from("books")
      .update({ total_chapters: totalChapters })
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .select("*")
      .single();
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { book: rowToBook(upd.data as Record<string, any>) });
  },

  // Define la lista de capítulos con nombre (reemplaza la existente). Resetea el progreso.
  "/chapters/set": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const titles = (Array.isArray(body.chapters) ? body.chapters : [])
      .map((t: unknown) => String(t ?? "").trim().slice(0, 280))
      .filter((t: string) => t.length > 0)
      .slice(0, 400);
    if (titles.length === 0) return bad("chapters required");

    const bookRes = await db
      .from("books")
      .select("id,added_by")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    if (bookRes.data.added_by !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Only the member who added the book (or an admin) can set chapters" });
    }

    // Reemplazo limpio: borra capítulos (cascada a completions/notes) y recrea.
    await db.from("book_chapters").delete().eq("community_id", auth.community.id).eq("book_id", bookId);
    const rows = titles.map((title: string, idx: number) => ({
      community_id: auth.community.id,
      book_id: bookId,
      idx,
      title
    }));
    const ins = await db.from("book_chapters").insert(rows).select("id,idx,title");
    if (ins.error) return dbFail(400, ins.error);

    await db.from("books").update({ total_chapters: titles.length }).eq("community_id", auth.community.id).eq("id", bookId);
    // Reset de progreso (las completions se borraron en cascada).
    await db
      .from("member_books")
      .update({ chapters_done: 0, shelf: "want", finished_at: null, updated_at: nowIso() })
      .eq("community_id", auth.community.id)
      .eq("book_id", bookId);
    const status = await recomputeBookStatus(auth.community.id, bookId);

    return json(200, {
      chapters: (ins.data ?? []).map((row: Record<string, any>) => ({
        id: row.id,
        idx: row.idx,
        title: row.title,
        doneByMe: false,
        completedCount: 0,
        notes: []
      })),
      bookStatus: status
    });
  },

  // Marca/desmarca un capítulo como completado por el usuario actual.
  "/chapters/toggle": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const chapterId = String(body.chapter_id ?? "").trim();
    if (!chapterId) return bad("chapter_id required");
    const done = Boolean(body.done);

    const chapterRes = await db
      .from("book_chapters")
      .select("id,book_id")
      .eq("community_id", auth.community.id)
      .eq("id", chapterId)
      .maybeSingle();
    if (chapterRes.error || !chapterRes.data) return json(404, { message: "Chapter not found" });
    const bookId = chapterRes.data.book_id as string;

    if (done) {
      const up = await db.from("chapter_completions").upsert(
        {
          community_id: auth.community.id,
          book_id: bookId,
          chapter_id: chapterId,
          user_id: auth.user.id,
          completed_at: nowIso()
        },
        { onConflict: "chapter_id,user_id" }
      );
      if (up.error) return dbFail(400, up.error);
    } else {
      const del = await db
        .from("chapter_completions")
        .delete()
        .eq("chapter_id", chapterId)
        .eq("user_id", auth.user.id);
      if (del.error) return dbFail(400, del.error);
    }

    const member = await recomputeMemberFromChapters(auth.community.id, bookId, auth.user.id);
    const status = await recomputeBookStatus(auth.community.id, bookId);
    return json(200, {
      chapterId,
      done,
      myMember: rowToMemberBook(member),
      bookStatus: status
    });
  },

  // Añade una anotación (nota o referencia) a un capítulo.
  "/chapters/note/add": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    // Anti-flood: máx. 20 notas por minuto y usuario.
    if (await isRateLimited(`note:${auth.user.id}`, 20, 60)) return slowDown();
    const nMuted = await mutedGate(auth.community.id, auth.user.id);
    if (nMuted) return nMuted;
    const body = await parseBody(req);
    const chapterId = String(body.chapter_id ?? "").trim();
    const text = String(body.text ?? "").trim().slice(0, 4000);
    if (!chapterId) return bad("chapter_id required");
    const imageUrl = safeHttpUrl(body.image_url);
    if (!text && !imageUrl) return bad("text or image required");
    const kind = ["reference", "prompt"].includes(body.kind) ? body.kind : "note";

    const chapterRes = await db
      .from("book_chapters")
      .select("id,book_id")
      .eq("community_id", auth.community.id)
      .eq("id", chapterId)
      .maybeSingle();
    if (chapterRes.error || !chapterRes.data) return json(404, { message: "Chapter not found" });

    const ins = await db
      .from("chapter_notes")
      .insert({
        community_id: auth.community.id,
        book_id: chapterRes.data.book_id,
        chapter_id: chapterId,
        user_id: auth.user.id,
        kind,
        text,
        image_url: imageUrl
      })
      .select("id,chapter_id,user_id,kind,text,image_url,created_at")
      .single();
    if (ins.error) return dbFail(400, ins.error);

    // Voto propio por defecto (estilo Reddit): el autor arranca con +1.
    await db.from("note_reactions").upsert(
      { community_id: auth.community.id, note_id: ins.data.id, user_id: auth.user.id, emoji: "up", created_at: nowIso() },
      { onConflict: "note_id,user_id,emoji" }
    );

    return json(200, {
      note: {
        id: ins.data.id,
        chapterId: ins.data.chapter_id,
        userId: ins.data.user_id ?? undefined,
        alias: auth.user.alias,
        kind: ins.data.kind ?? "note",
        text: ins.data.text,
        imageUrl: ins.data.image_url ?? undefined,
        reactions: [{ emoji: "up", count: 1, mine: true }],
        createdAt: toMillis(ins.data.created_at)
      }
    });
  },

  // Marca/quita el libro destacado de lectura del club (admin). Solo uno por color.
  "/books/feature": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    // Solo 'gold' (principal único). 'silver' descontinuado.
    const featured = body.featured === "gold" ? "gold" : null;

    const bookRes = await db
      .from("books")
      .select("id")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });

    if (featured) {
      // Libera el oro de cualquier otro libro del club (índice único parcial).
      await db
        .from("books")
        .update({ featured: null })
        .eq("community_id", auth.community.id)
        .eq("featured", featured)
        .neq("id", bookId);
    }
    const upd = await db
      .from("books")
      .update({ featured })
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .select("*")
      .single();
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { book: rowToBook(upd.data as Record<string, any>) });
  },

  // Edita metadata del libro (portada, título, autor, sinopsis…). Adder o admin.
  "/books/update": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");

    const bookRes = await db
      .from("books")
      .select("id,added_by")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    if (bookRes.data.added_by !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Only the member who added the book (or an admin) can edit it" });
    }

    const patch: Record<string, any> = { manually_edited: true };
    if (body.title !== undefined) {
      const title = String(body.title ?? "").trim().slice(0, 300);
      if (!title) return bad("title cannot be empty");
      patch.title = title;
    }
    if (body.author !== undefined) patch.author = body.author ? String(body.author).trim().slice(0, 200) : null;
    if (body.coverUrl !== undefined) patch.cover_url = body.coverUrl ? String(body.coverUrl).trim().slice(0, 1000) : null;
    if (body.description !== undefined) patch.description = body.description ? String(body.description).trim().slice(0, 4000) : null;
    if (body.publishedYear !== undefined) patch.published_year = Number.isFinite(Number(body.publishedYear)) ? Number(body.publishedYear) : null;
    if (body.pageCount !== undefined) patch.page_count = Number.isFinite(Number(body.pageCount)) ? Number(body.pageCount) : null;
    if (body.numberChapters !== undefined) patch.number_chapters = body.numberChapters !== false;

    const upd = await db
      .from("books")
      .update(patch)
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .select("*")
      .single();
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { book: rowToBook(upd.data as Record<string, any>) });
  },

  // C1: cadencia / meta de lectura (capítulo objetivo + fecha). Adder o admin.
  "/books/set_target": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const bookRes = await db
      .from("books")
      .select("id,added_by")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    if (bookRes.data.added_by !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Only the facilitator (or an admin) can set the cadence" });
    }
    const patch: Record<string, any> = {};
    if (body.target_chapter !== undefined) patch.target_chapter = Number.isFinite(Number(body.target_chapter)) && Number(body.target_chapter) > 0 ? Math.floor(Number(body.target_chapter)) : null;
    if (body.target_date !== undefined) patch.target_date = body.target_date ? String(body.target_date).slice(0, 10) : null;
    const upd = await db.from("books").update(patch).eq("community_id", auth.community.id).eq("id", bookId).select("*").single();
    if (upd.error) return dbFail(400, upd.error);
    return json(200, { book: rowToBook(upd.data as Record<string, any>) });
  },

  // "La cita": fecha de discusión del libro. La gestiona quien lo propuso (facilitador)
  // o un admin (que cubre su ausencia). Al fijarla, avisa al club.
  "/books/set_meeting": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const bookRes = await db.from("books").select("id,added_by,meeting_at").eq("community_id", auth.community.id).eq("id", bookId).maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    if (bookRes.data.added_by !== auth.user.id && auth.role !== "admin") {
      return json(403, { message: "Solo quien propuso el libro (o un admin) puede fijar la cita" });
    }
    // meeting_at: ISO válido o null (para cancelar). url validada http(s). place texto.
    let meetingAt: string | null = null;
    if (body.meeting_at) {
      const t = new Date(String(body.meeting_at)).getTime();
      meetingAt = Number.isFinite(t) ? new Date(t).toISOString() : null;
    }
    const patch: Record<string, any> = {
      meeting_at: meetingAt,
      meeting_url: body.meeting_url !== undefined ? safeHttpUrl(body.meeting_url) : (bookRes.data as Record<string, any>).meeting_url ?? null,
      meeting_place: body.meeting_place !== undefined ? (String(body.meeting_place ?? "").trim().slice(0, 200) || null) : undefined
    };
    if (patch.meeting_place === undefined) delete patch.meeting_place;
    const upd = await db.from("books").update(patch).eq("community_id", auth.community.id).eq("id", bookId).select("*").single();
    if (upd.error) return dbFail(400, upd.error);
    // Avisa al club solo cuando se FIJA una fecha nueva (no al cancelar).
    if (meetingAt) {
      const active = await activeMemberIdSet(auth.community.id);
      await notify(auth.community.id, [...active].filter((uid) => uid !== auth.user.id).map((uid) => ({ user_id: uid, kind: "meeting_set", actor_id: auth.user.id, book_id: bookId })));
    }
    return json(200, { book: rowToBook(upd.data as Record<string, any>) });
  },

  // RSVP a la cita: cualquier miembro dice si va o no.
  "/books/meeting/rsvp": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const status = ["yes", "no"].includes(body.status) ? body.status : null;
    const bookRes = await db.from("books").select("id").eq("community_id", auth.community.id).eq("id", bookId).maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });
    if (status === null) {
      // Sin status → quitar el RSVP.
      await db.from("book_meeting_rsvp").delete().eq("community_id", auth.community.id).eq("book_id", bookId).eq("user_id", auth.user.id);
    } else {
      await db.from("book_meeting_rsvp").upsert(
        { community_id: auth.community.id, book_id: bookId, user_id: auth.user.id, status, updated_at: nowIso() },
        { onConflict: "community_id,book_id,user_id" }
      );
    }
    const all = await db.from("book_meeting_rsvp").select("user_id,status").eq("community_id", auth.community.id).eq("book_id", bookId);
    const rows = all.data ?? [];
    const metaMap = await clubUserMetaMap(auth.community.id);
    return json(200, {
      rsvp: {
        going: rows.filter((r: Record<string, any>) => r.status === "yes").length,
        mine: rows.find((r: Record<string, any>) => r.user_id === auth.user.id)?.status ?? null,
        goingAliases: rows.filter((r: Record<string, any>) => r.status === "yes").map((r: Record<string, any>) => metaMap.get(r.user_id)?.alias ?? "—").slice(0, 8)
      }
    });
  },

  // Voto sobre una propuesta de libro (yes/no/later). Si TODOS los miembros activos
  // votan 'yes', el libro se aprueba (proposed -> reading).
  "/books/vote": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const vote = ["yes", "no"].includes(body.vote) ? body.vote : null;
    if (!vote) return bad("vote must be yes|no");

    const bookRes = await db
      .from("books")
      .select("id,status")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });

    const up = await db.from("book_votes").upsert(
      { community_id: auth.community.id, book_id: bookId, user_id: auth.user.id, vote, created_at: nowIso() },
      { onConflict: "book_id,user_id" }
    );
    if (up.error) return dbFail(400, up.error);

    let status = bookRes.data.status as string;
    if (status === "proposed") {
      const [activeRes, summary, modeRes] = await Promise.all([
        db.from("community_users").select("id", { count: "exact", head: true }).eq("community_id", auth.community.id).eq("status", "active"),
        voteSummary(auth.community.id, bookId, auth.user.id),
        db.from("communities").select("approval_mode").eq("id", auth.community.id).maybeSingle()
      ]);
      const activeCount = activeRes.count ?? 0;
      const mode = (modeRes.data?.approval_mode as string) ?? "majority";
      // Decisión por quórum de VOTANTES (ver evaluateProposal): un club con
      // lurkers ya no se atasca esperando una mayoría del censo entero.
      const outcome = evaluateProposal(summary.yes, summary.no, activeCount, mode);
      if (outcome === "reading") {
        await db.from("books").update({ status: "reading", decided_by: "vote" }).eq("community_id", auth.community.id).eq("id", bookId);
        status = "reading";
        // Libro aprobado → a leer: avisa a los activos (menos quien dio el voto que lo aprobó).
        const active = await activeMemberIdSet(auth.community.id);
        await notify(auth.community.id, [...active].filter((uid) => uid !== auth.user.id).map((uid) => ({ user_id: uid, kind: "book_approved", actor_id: auth.user.id, book_id: bookId })));
      } else if (outcome === "rejected") {
        await db.from("books").update({ status: "rejected", decided_by: "vote" }).eq("community_id", auth.community.id).eq("id", bookId);
        status = "rejected";
      }
    }
    const votes = await voteSummary(auth.community.id, bookId, auth.user.id);
    return json(200, { votes, bookStatus: status });
  },

  // El admin fuerza el estado del libro (proposed/reading/finished).
  "/books/set_status": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const denied = ensureAdmin(auth.role);
    if (denied) return denied;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const status = ["proposed", "reading", "finished", "rejected"].includes(body.status) ? body.status : null;
    if (!status) return bad("status must be proposed|reading|finished|rejected");

    const prior = await db.from("books").select("status").eq("community_id", auth.community.id).eq("id", bookId).maybeSingle();
    const priorStatus = (prior.data?.status as string) ?? "proposed";
    // Si un admin decide una propuesta (proposed → reading/rejected), lo registramos como 'admin'.
    const statusPatch: Record<string, unknown> = { status };
    if (priorStatus === "proposed" && (status === "reading" || status === "rejected")) statusPatch.decided_by = "admin";
    if (priorStatus === "rejected" && status === "proposed") statusPatch.decided_by = null; // reabrir: sin decisión aún
    const upd = await db
      .from("books")
      .update(statusPatch)
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .select("*")
      .single();
    if (upd.error || !upd.data) return json(404, { message: upd.error?.message ?? "Book not found" });
    const prev = (prior.data?.status as string) ?? "proposed";
    // Reabrir votación (rejected → proposed): resetea votos, plazo nuevo y re-vota "sí" el proponente.
    if (prev === "rejected" && status === "proposed") {
      await db.from("book_votes").delete().eq("community_id", auth.community.id).eq("book_id", bookId);
      await db
        .from("books")
        .update({ vote_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
        .eq("community_id", auth.community.id)
        .eq("id", bookId);
      const addedBy = (upd.data as Record<string, any>).added_by;
      if (addedBy) {
        await db.from("book_votes").upsert(
          { community_id: auth.community.id, book_id: bookId, user_id: addedBy, vote: "yes", created_at: nowIso() },
          { onConflict: "book_id,user_id" }
        );
      }
    }
    if (prev !== status && (status === "reading" || status === "finished")) {
      const active = await activeMemberIdSet(auth.community.id);
      const kind = status === "reading" ? "book_approved" : "book_finished";
      await notify(auth.community.id, [...active].filter((uid) => uid !== auth.user.id).map((uid) => ({ user_id: uid, kind, actor_id: auth.user.id, book_id: bookId })));
    }
    return json(200, { book: rowToBook(upd.data as Record<string, any>) });
  },

  // Eliminar un libro. Lo puede quitar quien lo añadió (solo si sigue en propuesta)
  // o cualquier admin (en cualquier estado). El borrado cascada limpia capítulos,
  // comentarios, votos, notas y member_books.
  "/books/delete": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");

    const bookRes = await db
      .from("books")
      .select("id,added_by,status")
      .eq("community_id", auth.community.id)
      .eq("id", bookId)
      .maybeSingle();
    if (bookRes.error || !bookRes.data) return json(404, { message: "Book not found" });

    const isAdmin = auth.role === "admin";
    const isAdder = bookRes.data.added_by === auth.user.id;
    if (!isAdmin && !isAdder) return json(403, { message: "Not allowed" });
    if (!isAdmin && bookRes.data.status !== "proposed") {
      return json(403, { message: "Only proposals can be removed by their proposer" });
    }

    const del = await db.from("books").delete().eq("community_id", auth.community.id).eq("id", bookId);
    if (del.error) return dbFail(500, del.error);
    return json(200, { ok: true });
  },

  // Marca TODOS los capítulos del libro como leídos por el usuario actual.
  "/chapters/complete_all": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const bookId = String(body.book_id ?? "").trim();
    if (!bookId) return bad("book_id required");
    const done = body.done === false ? false : true;

    const chaptersRes = await db
      .from("book_chapters")
      .select("id")
      .eq("community_id", auth.community.id)
      .eq("book_id", bookId);
    if (chaptersRes.error) return dbFail(500, chaptersRes.error);
    const chapterIds = (chaptersRes.data ?? []).map((r: Record<string, any>) => r.id as string);

    if (done) {
      if (chapterIds.length > 0) {
        const rows = chapterIds.map((chapterId) => ({
          community_id: auth.community.id,
          book_id: bookId,
          chapter_id: chapterId,
          user_id: auth.user.id,
          completed_at: nowIso()
        }));
        const up = await db.from("chapter_completions").upsert(rows, { onConflict: "chapter_id,user_id" });
        if (up.error) return dbFail(400, up.error);
      }
    } else {
      const del = await db
        .from("chapter_completions")
        .delete()
        .eq("community_id", auth.community.id)
        .eq("book_id", bookId)
        .eq("user_id", auth.user.id);
      if (del.error) return dbFail(400, del.error);
    }

    const member = await recomputeMemberFromChapters(auth.community.id, bookId, auth.user.id);
    const status = await recomputeBookStatus(auth.community.id, bookId);
    return json(200, { myMember: rowToMemberBook(member), bookStatus: status });
  },

  "/notifications/list": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const res = await db
      .from("notifications")
      .select("id,actor_id,kind,book_id,comment_id,text,read_at,created_at")
      .eq("community_id", auth.community.id)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (res.error) return dbFail(500, res.error);
    const rows = res.data ?? [];
    const bookIds = unique(rows.map((r: Record<string, any>) => r.book_id).filter(Boolean));
    const actorIds = unique(rows.map((r: Record<string, any>) => r.actor_id).filter(Boolean));
    const [booksRes, aliasMap] = await Promise.all([
      bookIds.length > 0
        ? db.from("books").select("id,title").eq("community_id", auth.community.id).in("id", bookIds)
        : Promise.resolve({ data: [], error: null } as const),
      clubUserAliasMap(auth.community.id)
    ]);
    const titleById = new Map((booksRes.data ?? []).map((b: Record<string, any>) => [b.id, b.title]));
    const notifications = rows.map((r: Record<string, any>) => ({
      id: r.id,
      kind: r.kind,
      bookId: r.book_id ?? undefined,
      commentId: r.comment_id ?? undefined,
      bookTitle: r.book_id ? titleById.get(r.book_id) ?? undefined : undefined,
      actorAlias: r.actor_id ? aliasMap.get(r.actor_id) ?? "—" : "—",
      text: r.text ?? undefined,
      readAt: r.read_at ? toMillis(r.read_at) : undefined,
      createdAt: toMillis(r.created_at)
    }));
    return json(200, {
      notifications,
      unreadCount: notifications.filter((n: Record<string, any>) => !n.readAt).length
    });
  },

  "/notifications/read": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    await db
      .from("notifications")
      .update({ read_at: nowIso() })
      .eq("community_id", auth.community.id)
      .eq("user_id", auth.user.id)
      .is("read_at", null);
    return json(200, { ok: true });
  },

  // Exportación de datos PROPIOS (RGPD-friendly): solo lo del usuario que pide,
  // nunca datos de otros miembros.
  "/data/export_me": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const me = auth.user.id;

    const [profileRes, roleRes, memberRes, commentsRes, notesRes, votesRes] = await Promise.all([
      db.from("community_users").select("id,alias,avatar_url,created_at").eq("community_id", auth.community.id).eq("id", me).maybeSingle(),
      db.from("community_user_roles").select("role").eq("community_id", auth.community.id).eq("user_id", me).maybeSingle(),
      db.from("member_books").select("book_id,shelf,chapters_done,rating,review,finished_at,updated_at").eq("community_id", auth.community.id).eq("user_id", me),
      db.from("book_comments").select("id,book_id,chapter_id,text,created_at,edited_at,deleted_at").eq("community_id", auth.community.id).eq("user_id", me),
      db.from("chapter_notes").select("id,chapter_id,book_id,kind,text,image_url,created_at").eq("community_id", auth.community.id).eq("user_id", me),
      db.from("book_votes").select("book_id,vote,voted_at").eq("community_id", auth.community.id).eq("user_id", me)
    ]);

    // Resolver títulos de libros implicados (solo para legibilidad del export).
    const bookIds = unique([
      ...(memberRes.data ?? []).map((r: Record<string, any>) => r.book_id),
      ...(commentsRes.data ?? []).map((r: Record<string, any>) => r.book_id),
      ...(notesRes.data ?? []).map((r: Record<string, any>) => r.book_id),
      ...(votesRes.data ?? []).map((r: Record<string, any>) => r.book_id)
    ].filter(Boolean));
    const booksRes = bookIds.length > 0
      ? await db.from("books").select("id,title").eq("community_id", auth.community.id).in("id", bookIds)
      : { data: [], error: null } as const;
    const titleById = new Map((booksRes.data ?? []).map((b: Record<string, any>) => [b.id, b.title]));
    const withTitle = (bookId: string) => titleById.get(bookId) ?? null;

    return json(200, {
      exportedAt: nowIso(),
      community: auth.community.name ?? auth.community.id,
      profile: profileRes.data
        ? { alias: profileRes.data.alias, avatarUrl: profileRes.data.avatar_url ?? null, role: (roleRes.data?.role as string) ?? "member", joinedAt: profileRes.data.created_at }
        : null,
      reading: (memberRes.data ?? []).map((r: Record<string, any>) => ({
        book: withTitle(r.book_id), shelf: r.shelf, chaptersDone: r.chapters_done, rating: r.rating ?? null, review: r.review ?? null, finishedAt: r.finished_at ?? null
      })),
      comments: (commentsRes.data ?? []).filter((r: Record<string, any>) => !r.deleted_at).map((r: Record<string, any>) => ({
        book: withTitle(r.book_id), text: r.text, createdAt: r.created_at, editedAt: r.edited_at ?? null
      })),
      notes: (notesRes.data ?? []).map((r: Record<string, any>) => ({
        book: withTitle(r.book_id), kind: r.kind, text: r.text, link: r.image_url ?? null, createdAt: r.created_at
      })),
      votes: (votesRes.data ?? []).map((r: Record<string, any>) => ({ book: withTitle(r.book_id), vote: r.vote, votedAt: r.voted_at }))
    });
  },

  // Perfil público de un miembro: su actividad de lectura en el club.
  "/users/profile": async (req: Request) => {
    const auth = await requireSession(req);
    if (auth instanceof Response) return auth;
    const body = await parseBody(req);
    const userId = String(body.user_id ?? "").trim() || auth.user.id;

    const [userRes, roleRes, memberRes] = await Promise.all([
      db.from("community_users").select("id,alias,avatar_url").eq("community_id", auth.community.id).eq("id", userId).maybeSingle(),
      db.from("community_user_roles").select("role").eq("community_id", auth.community.id).eq("user_id", userId).maybeSingle(),
      db
        .from("member_books")
        .select("book_id,shelf,chapters_done,rating,review,finished_at,updated_at")
        .eq("community_id", auth.community.id)
        .eq("user_id", userId)
    ]);
    if (userRes.error || !userRes.data) return json(404, { message: "User not found" });

    const member = memberRes.data ?? [];
    const bookIds = unique(member.map((m: Record<string, any>) => m.book_id));
    const booksRes = bookIds.length > 0
      ? await db.from("books").select("id,title,cover_url,total_chapters,status").eq("community_id", auth.community.id).in("id", bookIds)
      : { data: [], error: null } as const;
    const bookById = new Map((booksRes.data ?? []).map((b: Record<string, any>) => [b.id, b]));

    const items = member
      .map((m: Record<string, any>) => {
        const b = bookById.get(m.book_id);
        if (!b) return null;
        return {
          bookId: m.book_id,
          title: b.title,
          coverUrl: b.cover_url ?? undefined,
          shelf: m.shelf,
          chaptersDone: Number(m.chapters_done ?? 0),
          totalChapters: b.total_chapters ?? undefined,
          rating: m.rating ?? undefined,
          review: m.review ?? undefined,
          finishedAt: m.finished_at ? toMillis(m.finished_at) : undefined,
          updatedAt: toMillis(m.updated_at)
        };
      })
      .filter(Boolean)
      .sort((a: Record<string, any>, b: Record<string, any>) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    const finishedItems = items.filter((i: Record<string, any>) => i.shelf === "finished");
    const ratings = finishedItems.map((i: Record<string, any>) => i.rating).filter((r: number) => typeof r === "number");

    // Actividad reciente: comentarios y propuestas de este usuario (más nuevos primero).
    const [actCommentsRes, actProposalsRes] = await Promise.all([
      db.from("book_comments").select("book_id,text,created_at").eq("community_id", auth.community.id).eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
      db.from("books").select("id,title,created_at").eq("community_id", auth.community.id).eq("added_by", userId).order("created_at", { ascending: false }).limit(6)
    ]);
    const actComments = actCommentsRes.data ?? [];
    const missingIds = unique(actComments.map((c: Record<string, any>) => c.book_id).filter((id: string) => !bookById.has(id)));
    if (missingIds.length > 0) {
      const extra = await db.from("books").select("id,title").eq("community_id", auth.community.id).in("id", missingIds);
      (extra.data ?? []).forEach((b: Record<string, any>) => bookById.set(b.id, b));
    }
    const activity = [
      ...actComments.map((c: Record<string, any>) => ({
        kind: "comment",
        bookId: c.book_id,
        bookTitle: (bookById.get(c.book_id)?.title as string) ?? "",
        text: String(c.text ?? "").slice(0, 140),
        at: toMillis(c.created_at)
      })),
      ...(actProposalsRes.data ?? []).map((b: Record<string, any>) => ({
        kind: "proposal",
        bookId: b.id,
        bookTitle: b.title ?? "",
        at: toMillis(b.created_at)
      }))
    ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 12);

    return json(200, {
      user: {
        id: userRes.data.id,
        alias: userRes.data.alias,
        avatarUrl: userRes.data.avatar_url ?? undefined,
        role: (roleRes.data?.role as string) ?? "member"
      },
      finishedCount: finishedItems.length,
      avgRating: ratings.length > 0 ? Math.round((ratings.reduce((x: number, y: number) => x + y, 0) / ratings.length) * 10) / 10 : null,
      books: items,
      activity
    });
  }
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { message: "Method not allowed" });

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/functions\/v1\/community-api/, "")
    .replace(/^\/community-api/, "")
    .replace(/^\/community-api\/?/, "/");
  const handler = (handlers as Record<string, (request: Request) => Promise<Response>>)[path];
  if (!handler) return json(404, { message: "Not found" });

  try {
    return await handler(req);
  } catch (error) {
    // Detalle real solo en logs de servidor; al cliente, mensaje genérico.
    console.error("[community-api] unhandled:", error instanceof Error ? error.message : error);
    return json(500, { message: "Unhandled error" });
  }
});
