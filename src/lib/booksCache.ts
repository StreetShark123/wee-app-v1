// Caché para que navegar sea fluido (sin re-fetch en cada visita).
// Patrón stale-while-revalidate: pintamos lo cacheado al instante y revalidamos detrás.
// La lista persiste en localStorage para que un arranque nuevo de la app (PWA) pinte
// la estantería al momento en vez de repetir la pantalla de carga; como SIEMPRE se
// revalida detrás, lo rancio dura como mucho un round-trip.
import type { BookDetail, ClubBook, MemberBook, PersonalBook } from "./communityApi";

interface ListSnapshot {
  key: string;
  books: ClubBook[];
  memberBooks: MemberBook[];
}

const LIST_STORAGE_KEY = "wee:books:list";
const PERSONAL_STORAGE_KEY = "wee:personal:list";

let listSnapshot: ListSnapshot | null = null;
let personalSnapshot: PersonalBook[] | null = null;
const detailById = new Map<string, BookDetail>();

const readStoredList = (): ListSnapshot | null => {
  try {
    const raw = localStorage.getItem(LIST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListSnapshot;
    if (!parsed || typeof parsed.key !== "string" || !Array.isArray(parsed.books) || !Array.isArray(parsed.memberBooks)) return null;
    return parsed;
  } catch {
    return null;
  }
};

// key = id del community_user activo (los libros son por-club).
export const getCachedList = (key: string): { books: ClubBook[]; memberBooks: MemberBook[] } | null => {
  if (!listSnapshot) listSnapshot = readStoredList();
  return listSnapshot && listSnapshot.key === key ? { books: listSnapshot.books, memberBooks: listSnapshot.memberBooks } : null;
};
export const setCachedList = (key: string, snap: { books: ClubBook[]; memberBooks: MemberBook[] }): void => {
  listSnapshot = { key, ...snap };
  try {
    localStorage.setItem(LIST_STORAGE_KEY, JSON.stringify(listSnapshot));
  } catch {
    // Storage lleno o bloqueado: seguimos solo con la caché en memoria.
  }
};

// Biblioteca PERSONAL (por usuario global, independiente del club). Mismo
// patrón stale-while-revalidate para que "Tú" pinte al instante y no repita el
// skeleton en cada visita. Se limpia en clearBooksCache (logout).
export const getCachedPersonal = (): PersonalBook[] | null => {
  if (personalSnapshot) return personalSnapshot;
  try {
    const raw = localStorage.getItem(PERSONAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersonalBook[];
    if (!Array.isArray(parsed)) return null;
    personalSnapshot = parsed;
    return parsed;
  } catch {
    return null;
  }
};
export const setCachedPersonal = (books: PersonalBook[]): void => {
  personalSnapshot = books;
  try {
    localStorage.setItem(PERSONAL_STORAGE_KEY, JSON.stringify(books));
  } catch {
    // noop
  }
};

export const getCachedBook = (bookId: string): BookDetail | null => detailById.get(bookId) ?? null;
export const setCachedBook = (bookId: string, detail: BookDetail): void => {
  detailById.set(bookId, detail);
};

// Limpiar al cambiar de club o cerrar sesión (los datos son por-club).
export const clearBooksCache = (): void => {
  listSnapshot = null;
  personalSnapshot = null;
  detailById.clear();
  try {
    localStorage.removeItem(LIST_STORAGE_KEY);
    localStorage.removeItem(PERSONAL_STORAGE_KEY);
  } catch {
    // noop
  }
};
