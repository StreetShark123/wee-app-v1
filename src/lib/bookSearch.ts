const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const apikey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "";

export type BookSource = "google_books" | "open_library";

// Resultado crudo de la edge function `book-search` (ya normalizado).
export interface BookSearchResult {
  sourceId: string;
  isbn: string | null;
  title: string;
  author: string | null;
  coverUrl: string | null;
  description: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  source: BookSource;
}

// Lo que el usuario confirma para añadir (puede haber editado a mano).
export interface BookDraft {
  isbn: string | null;
  title: string;
  author: string | null;
  coverUrl: string | null;
  description: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  authorUrl: string | null;
  source: BookSource | "manual";
  manuallyEdited: boolean;
  proposalNote: string;
}

interface BookSearchResponse {
  results: BookSearchResult[];
  engine: BookSource;
}

export const searchBooks = async (params: {
  q?: string;
  isbn?: string;
  maxResults?: number;
}): Promise<BookSearchResult[]> => {
  if (!supabaseUrl) throw new Error("Supabase no configurado");
  const res = await fetch(`${supabaseUrl}/functions/v1/book-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apikey ? { apikey, Authorization: `Bearer ${apikey}` } : {})
    },
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`book-search ${res.status}`);
  const data = (await res.json()) as BookSearchResponse;
  return data?.results ?? [];
};

// Un resultado de búsqueda → borrador editable.
export const resultToDraft = (result: BookSearchResult): BookDraft => ({
  isbn: result.isbn,
  title: result.title,
  author: result.author,
  coverUrl: result.coverUrl,
  description: result.description,
  publishedYear: result.publishedYear,
  pageCount: result.pageCount,
  authorUrl: null,
  source: result.source,
  manuallyEdited: false,
  proposalNote: ""
});

// Borrador vacío para alta 100% manual (libro que no aparece en los índices).
export const emptyDraft = (): BookDraft => ({
  isbn: null,
  title: "",
  author: null,
  coverUrl: null,
  description: null,
  publishedYear: null,
  pageCount: null,
  authorUrl: null,
  source: "manual",
  manuallyEdited: true,
  proposalNote: ""
});
