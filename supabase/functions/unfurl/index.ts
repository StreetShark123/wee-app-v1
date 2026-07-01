import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CacheRow {
  canonical_url: string;
  final_url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  status_code: number | null;
  fetched_at: string;
  expires_at: string;
}

interface UnfurlResponse {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  finalUrl?: string;
  publishedAt?: string;
  schemaTypes?: string[];
  publisher?: string;
  author?: string;
  hasImprintOrContact?: boolean;
  outboundUrls?: string[];
  bodyText?: string;
  hasOverlayPopup?: boolean;
  adLikeNodeRatio?: number;
  articleSection?: string;
  newsKeywords?: string[];
  parselySection?: string;
  sailthruTags?: string[];
  breadcrumbs?: string[];
  relTags?: string[];
  jsonLdSections?: string[];
  jsonLdKeywords?: string[];
  jsonLdAbout?: string[];
  jsonLdGenre?: string[];
  jsonLdIsPartOf?: string[];
  cached: boolean;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const isPrivateIpv4 = (host: string): boolean => {
  const parts = host.split(".").map((item) => Number(item));
  if (parts.length !== 4 || parts.some((item) => Number.isNaN(item) || item < 0 || item > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // este host, privada, loopback
  if (a === 169 && b === 254) return true; // link-local: incluye metadata cloud 169.254.169.254
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reservado
  return false;
};

const isBlockedHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  // IPv6: loopback, link-local, ULA, y IPv4-mapeada (::ffff:127.0.0.1, etc.)
  if (normalized === "::1" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("::ffff:")) return isBlockedHost(normalized.slice("::ffff:".length));
  return isPrivateIpv4(normalized);
};

const MAX_REDIRECTS = 5;

// Sigue redirecciones MANUALMENTE re-validando el host en cada salto: si no, un
// host público puede redirigir (302) a localhost o al endpoint de metadatos.
const safeFetch = async (startUrl: string, init: RequestInit): Promise<Response> => {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    if (!["http:", "https:"].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
      throw new Error("Blocked host");
    }
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current).toString(); // el bucle re-valida el destino
      continue;
    }
    return response;
  }
  throw new Error("Too many redirects");
};

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const raw = token.split(".")[1];
    if (!raw) return null;
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const clean = (value?: string | null, max = 320): string | undefined => {
  if (!value) return undefined;
  const next = value.replace(/\s+/g, " ").trim();
  if (!next) return undefined;
  return next.slice(0, max);
};

const decodeEntities = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const parseAttributes = (tag: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const attrPattern = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(tag))) {
    const key = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    attrs[key] = decodeEntities(value.trim());
  }
  return attrs;
};

const collectMeta = (html: string): Array<Record<string, string>> => {
  const list: Array<Record<string, string>> = [];
  const pattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    list.push(parseAttributes(match[0]));
  }
  return list;
};

const absoluteUrl = (candidate: string | undefined, baseUrl: string): string | undefined => {
  if (!candidate) return undefined;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return undefined;
  }
};

const canonicalizeUrl = (input: string): string => {
  const url = new URL(input.trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

  const tracking = new Set([
    "fbclid",
    "gclid",
    "igshid",
    "igsh",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "feature",
    "si",
    "spm",
    "mkt_tok",
    "vero_id",
    "_hsenc",
    "_hsmi",
    "wt.mc_id"
  ]);

  const params: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (!value) return;
    if (normalized.startsWith("utm_")) return;
    if (tracking.has(normalized)) return;
    params.push([normalized, value]);
  });

  params.sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  params.forEach(([key, value]) => url.searchParams.append(key, value));

  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  return url.toString();
};

const pickMeta = (html: string, keys: string[]): string | undefined => {
  const metas = collectMeta(html);
  for (const key of keys) {
    const normalized = key.toLowerCase();
    const found = metas.find((meta) => {
      const target = (meta.property ?? meta.name ?? meta["http-equiv"] ?? "").toLowerCase();
      return target === normalized && typeof meta.content === "string" && meta.content.trim().length > 0;
    });
    if (found?.content) return found.content;
  }
  return undefined;
};

const splitValues = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(/[,|]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
};

const pickMetaArray = (html: string, keys: string[]): string[] => splitValues(pickMeta(html, keys));

const pickTitle = (html: string): string | undefined => {
  const og = pickMeta(html, ["og:title", "twitter:title"]);
  if (og) return og;
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match?.[1]) return undefined;
  return decodeEntities(match[1]);
};

const pickLinkHref = (html: string, relValues: string[]): string | undefined => {
  const pattern = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const rel = (attrs.rel ?? "").toLowerCase();
    if (!rel || !relValues.includes(rel)) continue;
    const href = attrs.href?.trim();
    if (href) return href;
  }
  return undefined;
};

const pickJsonLdImage = (html: string): string | undefined => {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        const image = candidate?.image;
        if (typeof image === "string" && image.trim()) return image.trim();
        if (Array.isArray(image) && typeof image[0] === "string") return image[0];
        if (image && typeof image.url === "string") return image.url;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return undefined;
};

const collectJsonLdEntries = (html: string): unknown[] => {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const entries: unknown[] = [];
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => entries.push(item));
      } else {
        entries.push(parsed);
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return entries;
};

const pickMetaOrJsonLd = (
  html: string,
  keys: string[],
  jsonLdSelector: (entry: Record<string, unknown>) => string | undefined
): string | undefined => {
  const fromMeta = pickMeta(html, keys);
  if (fromMeta) return fromMeta;
  const entries = collectJsonLdEntries(html);
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const value = jsonLdSelector(entry as Record<string, unknown>);
    if (value) return value;
  }
  return undefined;
};

const extractBodyText = (html: string): string | undefined => {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 8000);
};

const extractOutboundUrls = (html: string, finalUrl: string): string[] => {
  const urls = new Set<string>();
  const finalHost = new URL(finalUrl).hostname.toLowerCase().replace(/^www\./, "");
  const anchorPattern = /<a\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const href = attrs.href?.trim();
    if (!href) continue;
    try {
      const absolute = new URL(href, finalUrl);
      const host = absolute.hostname.toLowerCase().replace(/^www\./, "");
      if (host && host !== finalHost) urls.add(absolute.toString());
    } catch {
      // ignore malformed links
    }
  }
  return Array.from(urls).slice(0, 40);
};

const detectOverlaySignals = (html: string): { hasOverlayPopup: boolean; adLikeNodeRatio: number } => {
  const markerMatches =
    (html.match(/subscribe|paywall|modal|overlay|newsletter|cookie-consent|ad-|advert/i) ?? []).length;
  const nodeCount = Math.max(1, (html.match(/<div\b/gi) ?? []).length + (html.match(/<section\b/gi) ?? []).length);
  const adLikeCount = (html.match(/ad-|advert|sponsor|promo|subscribe|paywall/gi) ?? []).length;
  return {
    hasOverlayPopup: markerMatches >= 4,
    adLikeNodeRatio: Math.min(1, adLikeCount / nodeCount)
  };
};

const extractSchemaTypes = (html: string): string[] => {
  const entries = collectJsonLdEntries(html);
  const types = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const typeValue = (entry as Record<string, unknown>)["@type"];
    if (typeof typeValue === "string" && typeValue.trim()) types.add(typeValue.trim());
    if (Array.isArray(typeValue)) {
      typeValue.forEach((item) => {
        if (typeof item === "string" && item.trim()) types.add(item.trim());
      });
    }
  }
  return Array.from(types).slice(0, 8);
};

const extractBreadcrumbs = (html: string): string[] => {
  const crumbs: string[] = [];
  const navPattern = /<[^>]*(?:breadcrumb|breadcrumbs)[^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let match: RegExpExecArray | null;
  while ((match = navPattern.exec(html))) {
    const text = clean(match[1]?.replace(/<[^>]+>/g, " "), 120);
    if (text) crumbs.push(text);
  }
  return Array.from(new Set(crumbs)).slice(0, 8);
};

const extractRelTags = (html: string): string[] => {
  const tags: string[] = [];
  const anchorPattern = /<a\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const rel = (attrs.rel ?? "").toLowerCase();
    if (!rel.includes("tag")) continue;
    const href = attrs.href ?? "";
    if (!href) continue;
    tags.push(href.split("/").filter(Boolean).at(-1) ?? href);
  }
  return Array.from(new Set(tags.map((item) => item.replace(/[-_]/g, " ")))).slice(0, 12);
};

const extractJsonLdTextArray = (html: string, key: string): string[] => {
  const entries = collectJsonLdEntries(html);
  const values: string[] = [];
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const raw = (entry as Record<string, unknown>)[key];
    if (!raw) return;
    if (typeof raw === "string") values.push(raw);
    if (Array.isArray(raw)) {
      raw.forEach((item) => {
        if (typeof item === "string") values.push(item);
        if (item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string") {
          values.push((item as Record<string, unknown>).name as string);
        }
      });
    }
    if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).name === "string") {
      values.push((raw as Record<string, unknown>).name as string);
    }
  });
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).slice(0, 20);
};

const toResponseFromCache = (row: CacheRow): UnfurlResponse => ({
  title: clean(row.title, 140),
  description: clean(row.description, 320),
  imageUrl: clean(row.image_url, 1000),
  siteName: clean(row.site_name, 80),
  finalUrl: clean(row.final_url, 1000),
  cached: true
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const claims = parseJwtPayload(bearer);
    const role = typeof claims?.role === "string" ? claims.role : "";
    if (role !== "authenticated") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { url } = (await req.json()) as { url?: string };
    if (!url) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let canonicalUrl: string;
    let parsedInput: URL;
    try {
      parsedInput = new URL(url);
      if (!["http:", "https:"].includes(parsedInput.protocol)) {
        throw new Error("Invalid URL scheme");
      }
      if (isBlockedHost(parsedInput.hostname)) {
        throw new Error("Blocked host");
      }
      canonicalUrl = canonicalizeUrl(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase service envs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: cached, error: cachedError } = await admin
      .from("link_metadata_cache")
      .select("canonical_url,final_url,title,description,image_url,site_name,status_code,fetched_at,expires_at")
      .eq("canonical_url", canonicalUrl)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<CacheRow>();

    if (!cachedError && cached) {
      return new Response(JSON.stringify(toResponseFromCache(cached)), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const response = await safeFetch(canonicalUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "accept-language": "es-ES,es;q=0.9,en;q=0.8"
      }
    });

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
      return new Response(JSON.stringify({ error: "Content too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const html = await response.text();
    const finalUrl = response.url || canonicalUrl;

    const title = clean(pickTitle(html), 140);
    const description = clean(pickMeta(html, ["og:description", "twitter:description", "description"]), 320);
    const siteName = clean(pickMeta(html, ["og:site_name", "application-name"]), 80);
    const articleSection = clean(pickMeta(html, ["article:section"]), 80);
    const newsKeywords = pickMetaArray(html, ["news_keywords", "article:tag"]);
    const parselySection = clean(pickMeta(html, ["parsely-section"]), 80);
    const sailthruTags = pickMetaArray(html, ["sailthru.tags"]);
    const publishedAt = clean(
      pickMetaOrJsonLd(
        html,
        ["article:published_time", "og:published_time", "publish-date", "date"],
        (entry) => {
          const datePublished = entry.datePublished;
          return typeof datePublished === "string" ? datePublished : undefined;
        }
      ),
      60
    );
    const publisher = clean(
      pickMetaOrJsonLd(html, ["publisher", "article:publisher"], (entry) => {
        const raw = entry.publisher;
        if (typeof raw === "string") return raw;
        if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).name === "string") {
          return (raw as Record<string, unknown>).name as string;
        }
        return undefined;
      }),
      140
    );
    const author = clean(
      pickMetaOrJsonLd(html, ["author", "article:author"], (entry) => {
        const raw = entry.author;
        if (typeof raw === "string") return raw;
        if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).name === "string") {
          return (raw as Record<string, unknown>).name as string;
        }
        if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object" && typeof (raw[0] as Record<string, unknown>).name === "string") {
          return (raw[0] as Record<string, unknown>).name as string;
        }
        return undefined;
      }),
      140
    );

    const imageCandidate =
      pickMeta(html, ["og:image:secure_url", "og:image", "twitter:image", "thumbnail"]) ??
      pickLinkHref(html, ["image_src"]) ??
      pickJsonLdImage(html);
    const imageUrl = clean(absoluteUrl(imageCandidate, finalUrl), 1000);
    const schemaTypes = extractSchemaTypes(html);
    const breadcrumbs = extractBreadcrumbs(html);
    const relTags = extractRelTags(html);
    const jsonLdSections = extractJsonLdTextArray(html, "articleSection");
    const jsonLdKeywords = extractJsonLdTextArray(html, "keywords");
    const jsonLdAbout = extractJsonLdTextArray(html, "about");
    const jsonLdGenre = extractJsonLdTextArray(html, "genre");
    const jsonLdIsPartOf = extractJsonLdTextArray(html, "isPartOf");
    const bodyText = clean(extractBodyText(html), 5000);
    const outboundUrls = extractOutboundUrls(html, finalUrl);
    const { hasOverlayPopup, adLikeNodeRatio } = detectOverlaySignals(html);
    const hasImprintOrContact = /imprint|about|contact|contacto|aviso legal|about us/i.test(html);

    const now = new Date();
    const ttlMs = 1000 * 60 * 60 * 12;
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

    await admin.from("link_metadata_cache").upsert(
      {
        canonical_url: canonicalUrl,
        final_url: finalUrl,
        title: title ?? null,
        description: description ?? null,
        image_url: imageUrl ?? null,
        site_name: siteName ?? null,
        status_code: response.status,
        fetched_at: now.toISOString(),
        expires_at: expiresAt
      },
      { onConflict: "canonical_url" }
    );

    const payload: UnfurlResponse = {
      title,
      description,
      imageUrl,
      siteName,
      finalUrl,
      publishedAt,
      schemaTypes,
      publisher,
      author,
      hasImprintOrContact,
      outboundUrls,
      bodyText,
      hasOverlayPopup,
      adLikeNodeRatio,
      articleSection,
      newsKeywords,
      parselySection,
      sailthruTags,
      breadcrumbs,
      relTags,
      jsonLdSections,
      jsonLdKeywords,
      jsonLdAbout,
      jsonLdGenre,
      jsonLdIsPartOf,
      cached: false
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
