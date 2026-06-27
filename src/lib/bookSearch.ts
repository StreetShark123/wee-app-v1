import { supabase } from "./backend/supabase";

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
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.functions.invoke<BookSearchResponse>("book-search", {
    body: params
  });
  if (error) throw error;
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
  source: "manual",
  manuallyEdited: true,
  proposalNote: ""
});
