export interface CommunitySelection {
  id: string;
  name: string;
  description?: string;
  invitePolicy?: "admins_only" | "members_allowed";
  bookPolicy?: "admins_only" | "members_allowed";
  approvalMode?: "majority" | "all";
  rulesText?: string;
  slug?: string;
  visibility?: "public" | "private" | "invite";
}

export interface CommunityAuthSession {
  sessionToken: string;
  userId: string;
  alias: string;
  community: CommunitySelection;
}

export interface GlobalAuthSession {
  sessionToken: string;
  userId: string;
  username: string;
}

export interface GlobalUserSettings {
  defaultCommunityId?: string;
  skipPicker?: boolean;
}

const KEYS = {
  selected: "wee:community:selected",
  session: "wee:community:session",
  globalSession: "wee:global:session",
  globalSettings: "wee:global:settings"
} as const;

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const getSelectedCommunity = (): CommunitySelection | null => readJson<CommunitySelection>(KEYS.selected);
export const setSelectedCommunity = (community: CommunitySelection | null): void => {
  if (!community) {
    localStorage.removeItem(KEYS.selected);
    return;
  }
  localStorage.setItem(KEYS.selected, JSON.stringify(community));
};

export const getCommunitySession = (): CommunityAuthSession | null => readJson<CommunityAuthSession>(KEYS.session);
export const setCommunitySession = (session: CommunityAuthSession | null): void => {
  if (!session) {
    localStorage.removeItem(KEYS.session);
    return;
  }
  localStorage.setItem(KEYS.session, JSON.stringify(session));
  setSelectedCommunity(session.community);
};

export const clearCommunitySession = (): void => {
  localStorage.removeItem(KEYS.session);
};

export const getGlobalSession = (): GlobalAuthSession | null => readJson<GlobalAuthSession>(KEYS.globalSession);
export const setGlobalSession = (session: GlobalAuthSession | null): void => {
  if (!session) {
    localStorage.removeItem(KEYS.globalSession);
    return;
  }
  localStorage.setItem(KEYS.globalSession, JSON.stringify(session));
};

export const getGlobalSettings = (): GlobalUserSettings | null => readJson<GlobalUserSettings>(KEYS.globalSettings);
export const setGlobalSettings = (settings: GlobalUserSettings | null): void => {
  if (!settings) {
    localStorage.removeItem(KEYS.globalSettings);
    return;
  }
  localStorage.setItem(KEYS.globalSettings, JSON.stringify(settings));
};

export const clearGlobalSession = (): void => {
  localStorage.removeItem(KEYS.globalSession);
  localStorage.removeItem(KEYS.globalSettings);
};
