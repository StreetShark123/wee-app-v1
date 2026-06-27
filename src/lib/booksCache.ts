// Caché en memoria para que navegar sea fluido (sin re-fetch en cada visita).
// Patrón stale-while-revalidate: pintamos lo cacheado al instante y revalidamos detrás.
import type { BookDetail, ClubBook, MemberBook } from "./communityApi";

interface ListSnapshot {
  key: string;
  books: ClubBook[];
  memberBooks: MemberBook[];
}

let listSnapshot: ListSnapshot | null = null;
const detailById = new Map<string, BookDetail>();

// key = id del community_user activo (los libros son por-club).
export const getCachedList = (key: string): { books: ClubBook[]; memberBooks: MemberBook[] } | null =>
  listSnapshot && listSnapshot.key === key ? { books: listSnapshot.books, memberBooks: listSnapshot.memberBooks } : null;
export const setCachedList = (key: string, snap: { books: ClubBook[]; memberBooks: MemberBook[] }): void => {
  listSnapshot = { key, ...snap };
};

export const getCachedBook = (bookId: string): BookDetail | null => detailById.get(bookId) ?? null;
export const setCachedBook = (bookId: string, detail: BookDetail): void => {
  detailById.set(bookId, detail);
};

// Limpiar al cambiar de club o cerrar sesión (los datos son por-club).
export const clearBooksCache = (): void => {
  listSnapshot = null;
  detailById.clear();
};
