// book-search · indexa metadata de libros. Reemplaza a `unfurl` (OG de noticias).
//
// Dos motores:
//   - Google Books  → mejores sinopsis, pero requiere GOOGLE_BOOKS_API_KEY
//                     (sin key la cuota compartida de la IP de Supabase da 429).
//   - Open Library  → gratis, sin key, sin cuota; respaldo por defecto.
// Si hay key: Google primero, Open Library si falla/vacío. Sin key: Open Library.
//
// POST body: { q?: string, isbn?: string, maxResults?: number }
//   - isbn  → búsqueda exacta por ISBN
//   - q     → búsqueda libre por título/autor
// Respuesta: { results: BookResult[], engine: "google_books" | "open_library" }
//
// Cada BookResult viene normalizado al shape de la tabla `books`, listo para
// insertar (o editar a mano antes de guardar).

interface BookResult {
  sourceId: string;
  isbn: string | null;
  title: string;
  author: string | null;
  coverUrl: string | null;
  description: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  source: "google_books" | "open_library";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });

const clean = (value?: string | null, max = 4000): string | null => {
  if (!value) return null;
  const next = value.replace(/\s+/g, " ").trim();
  return next ? next.slice(0, max) : null;
};

const sanitizeIsbn = (value: string): string => value.replace(/[^0-9Xx]/g, "").toUpperCase();

const parseYear = (publishedDate: string | number | undefined): number | null => {
  if (typeof publishedDate === "number") return Number.isFinite(publishedDate) ? publishedDate : null;
  if (!publishedDate) return null;
  const match = String(publishedDate).match(/\d{4}/);
  const year = match ? Number(match[0]) : NaN;
  return Number.isFinite(year) ? year : null;
};

// Prefiere ISBN-13 (978/979); si no, el primero disponible.
const pickBestIsbn = (isbns: string[] | undefined): string | null => {
  if (!Array.isArray(isbns) || isbns.length === 0) return null;
  const thirteen = isbns.find((value) => value.length === 13 && /^(978|979)/.test(value));
  return thirteen ?? isbns[0] ?? null;
};

// ───────────────────────────── Google Books ─────────────────────────────
interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    pageCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
  };
}

const normalizeGoogleCover = (url: string | undefined): string | null => {
  if (!url) return null;
  return url.replace(/^http:\/\//, "https://").replace(/&edge=curl/g, "");
};

const googleToResult = (volume: GoogleVolume): BookResult | null => {
  const info = volume.volumeInfo ?? {};
  const title = clean(info.title, 300);
  if (!title) return null;
  const ids = info.industryIdentifiers ?? [];
  const isbn =
    ids.find((entry) => entry.type === "ISBN_13")?.identifier ??
    ids.find((entry) => entry.type === "ISBN_10")?.identifier ??
    null;
  const cover =
    normalizeGoogleCover(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail) ??
    (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null);
  return {
    sourceId: volume.id,
    isbn,
    title,
    author: info.authors?.length ? clean(info.authors.join(", "), 300) : null,
    coverUrl: cover,
    description: clean(info.description, 4000),
    publishedYear: parseYear(info.publishedDate),
    pageCount: typeof info.pageCount === "number" ? info.pageCount : null,
    source: "google_books"
  };
};

const searchGoogle = async (
  query: string,
  maxResults: number,
  apiKey: string
): Promise<BookResult[]> => {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    printType: "books",
    country: "ES",
    key: apiKey
  });
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`, {
    headers: { accept: "application/json" }
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const data = (await res.json()) as { items?: GoogleVolume[] };
  return (data.items ?? []).map(googleToResult).filter((e): e is BookResult => e !== null);
};

// ───────────────────────────── Open Library ─────────────────────────────
interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
}

const openLibraryToResult = (doc: OpenLibraryDoc): BookResult | null => {
  const title = clean(doc.title, 300);
  if (!title) return null;
  const isbn = pickBestIsbn(doc.isbn);
  const cover =
    typeof doc.cover_i === "number"
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : isbn
        ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
        : null;
  return {
    sourceId: doc.key ?? (isbn ? `isbn:${isbn}` : title),
    isbn,
    title,
    author: doc.author_name?.length ? clean(doc.author_name.join(", "), 300) : null,
    coverUrl: cover,
    description: null, // la search API de Open Library no trae sinopsis
    publishedYear: doc.first_publish_year ?? null,
    pageCount:
      typeof doc.number_of_pages_median === "number" ? doc.number_of_pages_median : null,
    source: "open_library"
  };
};

const searchOpenLibrary = async (
  q: string,
  isbn: string,
  maxResults: number
): Promise<BookResult[]> => {
  const params = new URLSearchParams({
    limit: String(maxResults),
    fields: "key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median"
  });
  if (isbn) params.set("isbn", isbn);
  else params.set("q", q);
  const res = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
    headers: { accept: "application/json" }
  });
  if (!res.ok) throw new Error(`openlibrary ${res.status}`);
  const data = (await res.json()) as { docs?: OpenLibraryDoc[] };
  return (data.docs ?? []).map(openLibraryToResult).filter((e): e is BookResult => e !== null);
};

// ───────────────────────────── Handler ─────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body: { q?: string; isbn?: string; maxResults?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const isbn = body.isbn ? sanitizeIsbn(body.isbn) : "";
  const q = clean(body.q, 200) ?? "";
  if (!isbn && !q) {
    return json(400, { error: "Provide `q` (title/author) or `isbn`." });
  }
  const maxResults = Math.min(Math.max(Number(body.maxResults) || 10, 1), 20);
  const apiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");

  try {
    // Con key: Google primero (mejores sinopsis), Open Library si falla o vacío.
    if (apiKey) {
      try {
        const googleResults = await searchGoogle(isbn ? `isbn:${isbn}` : q, maxResults, apiKey);
        if (googleResults.length > 0) {
          return json(200, { results: googleResults, engine: "google_books" });
        }
      } catch {
        // cae a Open Library
      }
    }
    const results = await searchOpenLibrary(q, isbn, maxResults);
    return json(200, { results, engine: "open_library" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
