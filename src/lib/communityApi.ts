import {
  clearCommunitySession,
  clearGlobalSession,
  getCommunitySession,
  getGlobalSession,
  getGlobalSettings,
  setCommunitySession,
  setSelectedCommunity,
  setGlobalSession,
  setGlobalSettings,
  type CommunityAuthSession,
  type CommunitySelection,
  type GlobalAuthSession
} from "./communitySession";
import type { Post, User, UserPreferences } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
const base = supabaseUrl ? `${supabaseUrl}/functions/v1/community-api` : "";

interface ApiError {
  message: string;
}

const headers = (): HeadersInit => {
  const session = getCommunitySession();
  const globalSession = getGlobalSession();
  const apikey = supabasePublishableKey || supabaseAnonKey;
  return {
    "Content-Type": "application/json",
    ...(apikey
      ? {
          apikey
        }
      : {}),
    ...(supabaseAnonKey
      ? {
          Authorization: `Bearer ${supabaseAnonKey}`
        }
      : {}),
    ...(session ? { "x-wee-session": session.sessionToken } : {}),
    ...(globalSession ? { "x-wee-global-session": globalSession.sessionToken } : {})
  };
};

const request = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  if (!base) throw new Error("Missing VITE_SUPABASE_URL for community API");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  const data = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const message = (data as ApiError)?.message ?? "Community API error";
    throw new Error(message);
  }
  return data as T;
};

export interface CommunityUser extends User {
  role: "admin" | "member";
}

export interface CommunityBootstrapResponse {
  users: CommunityUser[];
  posts: Post[];
  preferences: UserPreferences | null;
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface CommunityPreviewResponse {
  community_id: string;
  name: string;
  description?: string;
  inviter?: {
    alias: string;
    avatar_url?: string;
  };
}

export interface CommunityListItem {
  community_id: string;
  name: string;
  description?: string;
  role: "admin" | "member";
}

export interface GlobalAuthResponse {
  session_token: string;
  user: {
    id: string;
    username: string;
  };
  settings?: {
    default_community_id?: string;
    skip_picker?: boolean;
  };
}

export interface CommunityAuthResponse {
  session_token: string;
  user: {
    id: string;
    alias: string;
    language?: "es" | "en" | "gl";
  };
  community: {
    id: string;
    name: string;
    description?: string;
    rules_text?: string;
    invite_policy: "admins_only" | "members_allowed";
  };
}

const toSession = (payload: CommunityAuthResponse): CommunityAuthSession => ({
  sessionToken: payload.session_token,
  userId: payload.user.id,
  alias: payload.user.alias,
  community: {
    id: payload.community.id,
    name: payload.community.name,
    description: payload.community.description,
    invitePolicy: payload.community.invite_policy,
    rulesText: payload.community.rules_text
  }
});

const toGlobalSession = (payload: GlobalAuthResponse): GlobalAuthSession => ({
  sessionToken: payload.session_token,
  userId: payload.user.id,
  username: payload.user.username
});

export const registerGlobalUser = async (input: { username: string; password: string; email?: string }): Promise<GlobalAuthSession> => {
  const data = await request<GlobalAuthResponse>("/auth/register_global", input);
  const session = toGlobalSession(data);
  setGlobalSession(session);
  setGlobalSettings({
    defaultCommunityId: data.settings?.default_community_id,
    skipPicker: Boolean(data.settings?.skip_picker)
  });
  return session;
};

export const loginGlobalUser = async (input: { username: string; password: string }): Promise<GlobalAuthSession> => {
  const data = await request<GlobalAuthResponse>("/auth/login_global", input);
  const session = toGlobalSession(data);
  setGlobalSession(session);
  setGlobalSettings({
    defaultCommunityId: data.settings?.default_community_id,
    skipPicker: Boolean(data.settings?.skip_picker)
  });
  return session;
};

export const logoutGlobalUser = async (): Promise<void> => {
  try {
    await request<{ ok: true }>("/auth/logout_global", {});
  } catch {
    // Even if backend logout fails, clear local session to avoid lock-in loops.
  }
  clearCommunitySession();
  clearGlobalSession();
};

export const listMyCommunities = async (): Promise<{ communities: CommunityListItem[]; settings: { default_community_id?: string; skip_picker?: boolean } }> =>
  request<{ communities: CommunityListItem[]; settings: { default_community_id?: string; skip_picker?: boolean } }>("/communities/list", {});

export const enterCommunity = async (input: { community_id: string }): Promise<CommunityAuthSession> => {
  const data = await request<CommunityAuthResponse>("/community/enter", input);
  const session = toSession(data);
  setCommunitySession(session);
  return session;
};

export const updateGlobalSettings = async (input: { default_community_id?: string | null; skip_picker?: boolean }): Promise<void> => {
  const data = await request<{ settings: { default_community_id?: string; skip_picker?: boolean } }>("/user/settings/update", input);
  setGlobalSettings({
    defaultCommunityId: data.settings.default_community_id,
    skipPicker: Boolean(data.settings.skip_picker)
  });
};

export const getCachedGlobalSettings = () => getGlobalSettings();

export const createCommunity = async (input: {
  name: string;
  description?: string;
  rules_text?: string;
  invite_policy: "admins_only" | "members_allowed";
  code?: string;
  invite_expires_at?: string;
}): Promise<CommunityPreviewResponse> => {
  const globalSession = getGlobalSession();
  if (globalSession) {
    return request<CommunityPreviewResponse>("/community/create_global", input);
  }
  return request<CommunityPreviewResponse>("/community/create", input);
};

export const previewCommunity = async (input: { code?: string; token?: string }): Promise<CommunityPreviewResponse> =>
  request<CommunityPreviewResponse>("/community/preview", input);

export const confirmJoinCommunity = async (input: { code?: string; token?: string }): Promise<CommunitySelection> => {
  const globalSession = getGlobalSession();
  const data = await request<{ community_id: string; name: string; description?: string }>(
    globalSession ? "/community/join/by_invite" : "/community/join/confirm",
    input
  );
  const community: CommunitySelection = { id: data.community_id, name: data.name, description: data.description };
  return community;
};

export const registerCommunityUser = async (input: {
  community_id: string;
  alias: string;
  password: string;
  avatar_url?: string;
  language?: "es" | "en" | "gl";
}): Promise<CommunityAuthSession> => {
  const data = await request<CommunityAuthResponse>("/auth/register", input);
  const session = toSession(data);
  setCommunitySession(session);
  return session;
};

export const loginCommunityUser = async (input: {
  community_id: string;
  alias: string;
  password: string;
}): Promise<CommunityAuthSession> => {
  const data = await request<CommunityAuthResponse>("/auth/login", input);
  const session = toSession(data);
  setCommunitySession(session);
  return session;
};

export const logoutCommunityUser = async (): Promise<void> => {
  await request<{ ok: true }>("/auth/logout", {});
  setCommunitySession(null);
};

export const loadCommunityMeta = async (): Promise<{ community: CommunitySelection; members: Array<{ id: string; alias: string; role: "admin" | "member" }> }> =>
  request<{ community: CommunitySelection; members: Array<{ id: string; alias: string; role: "admin" | "member" }> }>("/community/meta", {});

export const updateCommunity = async (payload: {
  name?: string;
  description?: string;
  rules_text?: string;
}): Promise<CommunitySelection> => {
  const data = await request<{
    community: {
      id: string;
      name: string;
      description?: string;
      rules_text?: string;
      invite_policy: "admins_only" | "members_allowed";
    };
  }>("/community/update", payload);
  const community: CommunitySelection = {
    id: data.community.id,
    name: data.community.name,
    description: data.community.description,
    rulesText: data.community.rules_text,
    invitePolicy: data.community.invite_policy
  };
  setSelectedCommunity(community);
  return community;
};

export const promoteMember = async (targetUserId: string): Promise<void> => {
  await request<{ ok: true }>("/community/admin/promote", { target_user_id: targetUserId });
};

export const demoteMember = async (targetUserId: string): Promise<void> => {
  await request<{ ok: true }>("/community/admin/demote", { target_user_id: targetUserId });
};

export const removeMember = async (targetUserId: string): Promise<void> => {
  await request<{ ok: true }>("/community/admin/remove", { target_user_id: targetUserId });
};

export const leaveCommunity = async (): Promise<void> => {
  await request<{ ok: true }>("/community/leave", {});
  setCommunitySession(null);
};

export const createInvite = async (input?: { code?: string; expires_at?: string }): Promise<{ id: string; code: string; token: string; link: string }> =>
  request<{ id: string; code: string; token: string; link: string }>("/community/invite/create", input ?? {});

export const revokeInvite = async (inviteId: string): Promise<void> => {
  await request<{ ok: true }>("/community/invite/revoke", { invite_id: inviteId });
};

export const setInviteExpiry = async (inviteId: string, expiresAt: string | null): Promise<void> => {
  await request<{ ok: true }>("/community/invite/set_expiry", { invite_id: inviteId, expires_at: expiresAt });
};

export const bootstrapCommunityData = async (options?: {
  limit?: number;
  cursorCreatedAt?: string;
  includeUsers?: boolean;
  includePreferences?: boolean;
}): Promise<CommunityBootstrapResponse> =>
  request<CommunityBootstrapResponse>("/data/bootstrap", {
    ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
    ...(options?.cursorCreatedAt ? { cursor_created_at: options.cursorCreatedAt } : {}),
    ...(typeof options?.includeUsers === "boolean" ? { include_users: options.includeUsers } : {}),
    ...(typeof options?.includePreferences === "boolean" ? { include_preferences: options.includePreferences } : {})
  });

export const createCommunityPost = async (post: Post): Promise<Post> =>
  request<Post>("/data/post/create", { post });

export const updateCommunityPost = async (post: Post): Promise<Post> =>
  request<Post>("/data/post/update", { post });

export const deleteCommunityPost = async (postId: string): Promise<void> => {
  await request<{ ok: true }>("/data/post/delete", { post_id: postId });
};

export const getCommunityPreferences = async (): Promise<UserPreferences | null> =>
  request<UserPreferences | null>("/data/preferences/get", {});

export const upsertCommunityPreferences = async (prefs: UserPreferences): Promise<UserPreferences> =>
  request<UserPreferences>("/data/preferences/upsert", { preferences: prefs });

export const reportCommunityPost = async (postId: string, reason: string): Promise<void> => {
  await request<{ ok: true }>("/data/report/create", { post_id: postId, reason });
};

export const updateCommunityProfile = async (payload: {
  alias?: string;
  avatarDataUrl?: string;
  language?: "es" | "en" | "gl";
}): Promise<{ user: CommunityUser }> =>
  request<{ user: CommunityUser }>("/data/profile/update", {
    alias: payload.alias,
    avatar_url: payload.avatarDataUrl,
    language: payload.language
  });

// ───────────────────────────── Club de lectura: libros ─────────────────────────
export type BookSourceTag = "google_books" | "open_library" | "manual";
export type BookStatus = "proposed" | "reading" | "finished";
export type BookFeatured = "gold" | "silver";

export interface ClubBook {
  id: string;
  communityId: string;
  addedBy?: string;
  isbn?: string;
  title: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  publishedYear?: number;
  pageCount?: number;
  totalChapters?: number;
  source: BookSourceTag;
  manuallyEdited: boolean;
  status: BookStatus;
  featured?: BookFeatured;
  createdAt: number;
}

export interface MemberBook {
  bookId: string;
  userId: string;
  shelf: "want" | "reading" | "finished";
  chaptersDone: number;
  rating?: number;
  review?: string;
  finishedAt?: number;
  updatedAt: number;
}

export interface NewBookPayload {
  isbn?: string | null;
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  description?: string | null;
  publishedYear?: number | null;
  pageCount?: number | null;
  totalChapters?: number | null;
  source: BookSourceTag;
  manuallyEdited: boolean;
}

export const listClubBooks = async (): Promise<{ books: ClubBook[]; memberBooks: MemberBook[] }> =>
  request<{ books: ClubBook[]; memberBooks: MemberBook[] }>("/books/list", {});

export const createClubBook = async (book: NewBookPayload): Promise<{ book: ClubBook }> =>
  request<{ book: ClubBook }>("/books/create", { book });

export interface BookComment {
  id: string;
  userId: string;
  alias: string;
  text: string;
  createdAt: number;
}

export interface BookMemberProgress extends MemberBook {
  alias: string;
}

export interface ChapterNote {
  id: string;
  chapterId?: string;
  userId?: string;
  alias: string;
  kind: "note" | "reference";
  text: string;
  createdAt: number;
}

export interface BookChapter {
  id: string;
  idx: number;
  title: string;
  doneByMe: boolean;
  completedCount: number;
  notes: ChapterNote[];
}

export interface BookDetail {
  book: ClubBook;
  comments: BookComment[];
  members: BookMemberProgress[];
  myMember: BookMemberProgress | null;
  chapters: BookChapter[];
}

export const getClubBook = async (bookId: string): Promise<BookDetail> =>
  request<BookDetail>("/books/get", { book_id: bookId });

export const addBookComment = async (bookId: string, text: string): Promise<{ comment: BookComment }> =>
  request<{ comment: BookComment }>("/books/comment", { book_id: bookId, text });

export const setBookProgress = async (
  bookId: string,
  chaptersDone: number,
  shelf?: MemberBook["shelf"]
): Promise<{ myMember: MemberBook; bookStatus: BookStatus }> =>
  request<{ myMember: MemberBook; bookStatus: BookStatus }>("/books/progress", {
    book_id: bookId,
    chapters_done: chaptersDone,
    ...(shelf ? { shelf } : {})
  });

export const finishBook = async (
  bookId: string,
  rating?: number,
  review?: string
): Promise<{ myMember: MemberBook; bookStatus: BookStatus }> =>
  request<{ myMember: MemberBook; bookStatus: BookStatus }>("/books/finish", {
    book_id: bookId,
    ...(rating ? { rating } : {}),
    ...(review ? { review } : {})
  });

export const setBookChapters = async (bookId: string, totalChapters: number): Promise<{ book: ClubBook }> =>
  request<{ book: ClubBook }>("/books/set_chapters", { book_id: bookId, total_chapters: totalChapters });

export const setBookChaptersList = async (
  bookId: string,
  chapters: string[]
): Promise<{ chapters: BookChapter[]; bookStatus: BookStatus }> =>
  request<{ chapters: BookChapter[]; bookStatus: BookStatus }>("/chapters/set", { book_id: bookId, chapters });

export const toggleChapter = async (
  chapterId: string,
  done: boolean
): Promise<{ chapterId: string; done: boolean; myMember: MemberBook; bookStatus: BookStatus }> =>
  request<{ chapterId: string; done: boolean; myMember: MemberBook; bookStatus: BookStatus }>("/chapters/toggle", {
    chapter_id: chapterId,
    done
  });

export const addChapterNote = async (
  chapterId: string,
  text: string,
  kind: "note" | "reference" = "note"
): Promise<{ note: ChapterNote }> =>
  request<{ note: ChapterNote }>("/chapters/note/add", { chapter_id: chapterId, text, kind });

export const setBookFeatured = async (
  bookId: string,
  featured: BookFeatured | null
): Promise<{ book: ClubBook }> =>
  request<{ book: ClubBook }>("/books/feature", { book_id: bookId, featured });
