import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addPost,
  clearStoreCache,
  deletePostById,
  deleteUserById,
  exportAllData,
  getActiveUserId,
  getPreferences,
  getUserById,
  getUsers,
  importAllData,
  listPostsByTopic,
  listPostsByUser,
  setActiveUserId,
  updateUser,
  updatePost,
  upsertPreferences
} from "./store";
import {
  enterCommunity,
  getCachedGlobalSettings,
  listMyCommunities,
  loginGlobalUser,
  logoutGlobalUser,
  registerGlobalUser,
  updateGlobalSettings,
  confirmJoinCommunity,
  createInvite,
  createCommunity,
  leaveCommunity,
  loadCommunityMeta,
  loginCommunityUser,
  logoutCommunityUser,
  previewCommunity,
  registerCommunityUser,
  updateCommunity
} from "./communityApi";
import {
  clearCommunitySession,
  clearGlobalSession,
  getCommunitySession,
  getGlobalSession,
  getSelectedCommunity,
  setSelectedCommunity,
  type CommunitySelection,
  type GlobalAuthSession
} from "./communitySession";
import type { AppLanguage, ExportBundle, Post, SearchFilters, User, UserCommunityStats, UserPreferences } from "./types";
import { isStrongPassword } from "./auth";
import { auraRuntimeConfig, computeUserInfluenceScore, computeUserQualityScore } from "./auraEngine";
import { isCommunitySessionAccessError } from "./communityNavigation";
import { clamp, colorFromString, getInitials, normalizeSpace } from "./utils";

interface CreateOrLoginResult {
  user: User;
  isNewUser: boolean;
}

const PRIVACY_POLICY_VERSION = "2026-03-04";

export const DEFAULT_FILTERS: SearchFilters = {
  query: "",
  qualityLabel: "all",
  topic: "all",
  domain: "all"
};

const matchesQuery = (post: Post, query: string): boolean => {
  if (!query) return true;
  const normalized = normalizeSpace(query);
  return (
    post.normalizedText.includes(normalized) ||
    post.topics.some((topic) => topic.includes(normalized)) ||
    (post.sourceDomain ?? "").includes(normalized)
  );
};

const applyFilters = (
  posts: Post[],
  filters: SearchFilters,
  preferences?: UserPreferences
): Post[] =>
  posts.filter((post) => {
    if (filters.qualityLabel !== "all" && post.qualityLabel !== filters.qualityLabel) return false;
    if (filters.topic !== "all" && !post.topics.includes(filters.topic)) return false;
    if (filters.domain !== "all" && post.sourceDomain !== filters.domain) return false;
    if (!matchesQuery(post, filters.query)) return false;

    if (preferences) {
      if (preferences.blockedDomains.some((domain) => post.sourceDomain?.includes(domain))) return false;
      if (preferences.blockedKeywords.some((keyword) => post.normalizedText.includes(normalizeSpace(keyword)))) return false;
      if (preferences.preferredTopics.length > 0) {
        const hasPreferred = post.topics.some((topic) => preferences.preferredTopics.includes(topic));
        if (!hasPreferred) return false;
      }
    }

    return true;
  });

const levelFromPoints = (points: number): number => {
  if (points <= 0) return 1;
  return Math.max(1, Math.floor(Math.sqrt(points / 110)) + 1);
};

const pointsForLevel = (level: number): number => {
  const safeLevel = Math.max(1, level);
  return (safeLevel - 1) * (safeLevel - 1) * 110;
};

const toPublicBackendError = (raw: string): string => {
  const value = raw.toLowerCase();
  if (value.includes("remote_required_missing_config")) return "BACKEND_CONFIG_MISSING";
  if (value.includes("invalid api key") || value.includes("jwt") || value.includes("permission denied")) {
    return "BACKEND_AUTH_FAILED";
  }
  if (value.includes("failed to fetch") || value.includes("network") || value.includes("timeout")) {
    return "BACKEND_UNREACHABLE";
  }
  return "BACKEND_GENERIC";
};

export const useAppData = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeUserId, setActiveUserIdState] = useState<string | null>(getActiveUserId());
  const [globalSession, setGlobalSessionState] = useState<GlobalAuthSession | null>(getGlobalSession());
  const [selectedCommunity, setSelectedCommunityState] = useState<CommunitySelection | null>(getSelectedCommunity());
  const [globalSettings, setGlobalSettingsState] = useState<{ defaultCommunityId?: string; skipPicker?: boolean }>(
    () => getCachedGlobalSettings() ?? {}
  );
  const [communityRulesText, setCommunityRulesText] = useState("");
  const [communityMembers, setCommunityMembers] = useState<Array<{ id: string; alias: string; role: "admin" | "member" }>>([]);
  const [communityOwnerId, setCommunityOwnerId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const hasBootstrapped = useRef(false);

  const reload = useCallback(async (options?: { showSkeleton?: boolean; includePreferences?: boolean }) => {
    const showSkeleton = options?.showSkeleton ?? false;
    const includePreferences = options?.includePreferences ?? true;
    if (showSkeleton) {
      setLoading(true);
    }
    try {
      const session = getCommunitySession();
      setGlobalSessionState(getGlobalSession());
      if (!session) {
        setUsers([]);
        setPosts([]);
        setPreferences(null);
        setBackendError(null);
        setLoading(false);
        return;
      }
      const fetchedUsers = await getUsers();
      setUsers(fetchedUsers);
      setPosts([]); // el club de lectura no usa posts
      setSelectedCommunityState(session.community);
      setSelectedCommunity(session.community);

      if (includePreferences && activeUserId) {
        const prefs = await getPreferences(activeUserId);
        setPreferences(prefs);
      } else if (!activeUserId) {
        setPreferences(null);
      }
      setBackendError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown backend error";
      if (isCommunitySessionAccessError(message)) {
        clearCommunitySession();
        setSelectedCommunityState(null);
      }
      setBackendError(toPublicBackendError(message));
    }

    if (showSkeleton) {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    const showFullLoading = !hasBootstrapped.current;
    hasBootstrapped.current = true;
    void reload({ showSkeleton: showFullLoading });
  }, [reload]);

  // (El paginado en background de posts se retiró: el club de lectura no usa posts.)

  useEffect(() => {
    const session = getCommunitySession();
    const userId = session?.userId ?? null;
    setGlobalSessionState(getGlobalSession());
    setActiveUserId(userId);
    setActiveUserIdState(userId);
    setSelectedCommunityState(session?.community ?? getSelectedCommunity());
  }, []);

  const activeUser = useMemo(
    () => users.find((user) => user.id === activeUserId) ?? null,
    [users, activeUserId]
  );

  const loginWithUserId = useCallback((userId: string) => {
    setActiveUserId(userId);
    setActiveUserIdState(userId);
  }, []);

  const logout = useCallback(() => {
    void logoutCommunityUser().catch(() => undefined);
    clearCommunitySession();
    setActiveUserId(null);
    setActiveUserIdState(null);
    setUsers([]);
    setPosts([]);
    setPreferences(null);
  }, []);

  const logoutGlobal = useCallback(async () => {
    await logoutGlobalUser().catch(() => undefined);
    clearCommunitySession();
    clearGlobalSession();
    setGlobalSessionState(null);
    setGlobalSettingsState({});
    setSelectedCommunityState(null);
    setActiveUserId(null);
    setActiveUserIdState(null);
    setUsers([]);
    setPosts([]);
    setPreferences(null);
  }, []);

  const loginGlobal = useCallback(async (username: string, password: string) => {
    const session = await loginGlobalUser({ username, password });
    setGlobalSessionState(session);
    setGlobalSettingsState(getCachedGlobalSettings() ?? {});
    return session;
  }, []);

  const registerGlobal = useCallback(async (username: string, password: string, email?: string) => {
    const session = await registerGlobalUser({ username, password, email });
    setGlobalSessionState(session);
    setGlobalSettingsState(getCachedGlobalSettings() ?? {});
    return session;
  }, []);

  const fetchCommunities = useCallback(async () => {
    const data = await listMyCommunities();
    setGlobalSettingsState({
      defaultCommunityId: data.settings.default_community_id,
      skipPicker: Boolean(data.settings.skip_picker)
    });
    return data;
  }, []);

  const setCommunityAsActive = useCallback(async (communityId: string) => {
    const session = await enterCommunity({ community_id: communityId });
    clearStoreCache();
    setSelectedCommunityState(session.community);
    setActiveUserId(session.userId);
    setActiveUserIdState(session.userId);
    await reload();
  }, [reload]);

  const saveGlobalSettings = useCallback(async (input: { defaultCommunityId?: string | null; skipPicker?: boolean }) => {
    await updateGlobalSettings({
      default_community_id: input.defaultCommunityId ?? null,
      skip_picker: input.skipPicker
    });
    setGlobalSettingsState(getCachedGlobalSettings() ?? {});
  }, []);

  const createOrLogin = useCallback(
    async (
      alias: string,
      password: string,
      avatarDataUrl?: string,
      language?: AppLanguage,
      acceptedPrivacy = false
    ): Promise<CreateOrLoginResult> => {
      const normalizedAlias = alias.trim().slice(0, 40);
      if (!normalizedAlias) {
        throw new Error("Alias requerido");
      }
      const cleanPassword = password.trim();
      if (!cleanPassword) {
        throw new Error("PASSWORD_REQUIRED");
      }
      const selected = selectedCommunity ?? getSelectedCommunity();
      if (!selected?.id) throw new Error("COMMUNITY_REQUIRED");
      const existing = users.find((user) => user.alias.toLowerCase() === normalizedAlias.toLowerCase());

      if (existing) {
        const session = await loginCommunityUser({
          community_id: selected.id,
          alias: normalizedAlias,
          password: cleanPassword
        });
        setActiveUserId(session.userId);
        setActiveUserIdState(session.userId);
        await reload();
        const user = (await getUserById(session.userId)) ?? {
          id: session.userId,
          alias: session.alias,
          role: "member",
          language: session.community.invitePolicy ? language ?? "es" : "es",
          createdAt: Date.now()
        };
        return { user, isNewUser: false };
      }

      if (!acceptedPrivacy) throw new Error("PRIVACY_CONSENT_REQUIRED");
      if (!isStrongPassword(cleanPassword)) throw new Error("WEAK_PASSWORD");

      const session = await registerCommunityUser({
        community_id: selected.id,
        alias: normalizedAlias,
        password: cleanPassword,
        avatar_url: avatarDataUrl,
        language: language ?? "es"
      });
      setActiveUserId(session.userId);
      setActiveUserIdState(session.userId);
      await reload();
      const user = (await getUserById(session.userId)) ?? {
        id: session.userId,
        alias: session.alias,
        role: "member",
        language: language ?? "es",
        avatarDataUrl,
        avatarColor: avatarDataUrl ? undefined : colorFromString(normalizedAlias),
        initials: getInitials(normalizedAlias),
        privacyConsentAt: Date.now(),
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        createdAt: Date.now()
      };
      return { user, isNewUser: true };
    },
    [users, reload, selectedCommunity]
  );

  const createCommunityFlow = useCallback(
    async (
      input: { name: string; description?: string; rulesText?: string; invitePolicy: "admins_only" | "members_allowed"; inviteExpiry?: string }
    ): Promise<{ id: string; name: string; description?: string; inviteCode?: string; inviteToken?: string }> => {
      const created = await createCommunity({
        name: input.name,
        description: input.description,
        rules_text: input.rulesText,
        invite_policy: input.invitePolicy,
        invite_expires_at: input.inviteExpiry
      });
      const selected: CommunitySelection = {
        id: created.community_id,
        name: created.name,
        description: created.description
      };
      setSelectedCommunity(selected);
      setSelectedCommunityState(selected);
      return { id: created.community_id, name: created.name, description: created.description };
    },
    []
  );

  const previewCommunityInvite = useCallback(
    async (
      input: { code?: string; token?: string }
    ): Promise<CommunitySelection & { inviter?: { alias: string; avatar_url?: string } }> => {
      const data = await previewCommunity(input);
      return { id: data.community_id, name: data.name, description: data.description, inviter: data.inviter };
    },
    []
  );

  const confirmCommunityInvite = useCallback(
    async (input: { code?: string; token?: string }): Promise<CommunitySelection> => {
      const selected = await confirmJoinCommunity(input);
      setSelectedCommunityState(selected);
      return selected;
    },
    []
  );

  const leaveCurrentCommunity = useCallback(async (): Promise<void> => {
    await leaveCommunity();
    clearCommunitySession();
    setSelectedCommunity(null);
    setSelectedCommunityState(null);
    setActiveUserId(null);
    setActiveUserIdState(null);
    setUsers([]);
    setPosts([]);
    setPreferences(null);
  }, []);

  const loadCommunityOverview = useCallback(async () => {
    const data = await loadCommunityMeta();
    setCommunityRulesText(data.community.rulesText ?? "");
    setCommunityMembers(data.members);
    setCommunityOwnerId(data.community.ownerId ?? null);
    if (data.community.id && data.community.name) {
      const selected: CommunitySelection = {
        id: data.community.id,
        name: data.community.name,
        description: data.community.description,
        rulesText: data.community.rulesText,
        slug: data.community.slug,
        visibility: data.community.visibility
      };
      setSelectedCommunityState(selected);
      setSelectedCommunity(selected);
    }
    return data;
  }, []);

  const updateCommunityDetails = useCallback(
    async (input: { name?: string; description?: string; rulesText?: string; visibility?: "public" | "private" | "invite"; slug?: string }) => {
      const community = await updateCommunity({
        name: input.name,
        description: input.description,
        rules_text: input.rulesText,
        visibility: input.visibility,
        slug: input.slug
      });
      setSelectedCommunityState(community);
      setSelectedCommunity(community);
      await loadCommunityOverview();
      return community;
    },
    [loadCommunityOverview]
  );

  const createCommunityInvite = useCallback(async () => createInvite(), []);

  const createPost = useCallback(
    async (post: Post) => {
      await addPost(post);
      await reload({ includePreferences: false });
    },
    [reload]
  );

  const savePost = useCallback(
    async (post: Post) => {
      await updatePost(post);
      await reload({ includePreferences: false });
    },
    [reload]
  );

  const removePost = useCallback(
    async (postId: string) => {
      await deletePostById(postId);
      await reload({ includePreferences: false });
    },
    [reload]
  );

  const removeComment = useCallback(
    async (postId: string, commentId: string) => {
      const post = posts.find((entry) => entry.id === postId);
      if (!post) return;
      const nextComments = (post.comments ?? []).filter((comment) => comment.id !== commentId);
      await updatePost({ ...post, comments: nextComments });
      await reload({ includePreferences: false });
    },
    [posts, reload]
  );

  const updatePostPrimaryTopic = useCallback(
    async (postId: string, nextTopicRaw: string) => {
      const post = posts.find((entry) => entry.id === postId);
      if (!post) return;
      const nextTopic = normalizeSpace(nextTopicRaw).replace(/\s+/g, "-").slice(0, 42);
      if (!nextTopic) return;
      const restTopics = (post.topics ?? []).filter((topic) => topic !== nextTopic);
      await updatePost({ ...post, topics: [nextTopic, ...restTopics].slice(0, 6) });
      await reload({ includePreferences: false });
    },
    [posts, reload]
  );

  const renameTopicAcrossPosts = useCallback(
    async (fromTopicRaw: string, toTopicRaw: string) => {
      const fromTopic = normalizeSpace(fromTopicRaw);
      const toTopic = normalizeSpace(toTopicRaw).replace(/\s+/g, "-").slice(0, 42);
      if (!fromTopic || !toTopic || fromTopic === toTopic) return;
      const impacted = posts.filter((post) => post.topics.includes(fromTopic));
      for (const post of impacted) {
        const nextTopics = post.topics.map((topic) => (topic === fromTopic ? toTopic : topic));
        const unique = Array.from(new Set(nextTopics));
        await updatePost({ ...post, topics: unique });
      }
      await reload({ includePreferences: false });
    },
    [posts, reload]
  );

  const removeUser = useCallback(
    async (userId: string) => {
      await deleteUserById(userId);
      await reload({ includePreferences: false });
    },
    [reload]
  );

  const updateUserAvatar = useCallback(
    async (userId: string, avatarDataUrl: string | undefined) => {
      const existing = users.find((user) => user.id === userId);
      if (!existing) return;

      const nextUser: User = {
        ...existing,
        avatarDataUrl,
        avatarColor: avatarDataUrl ? undefined : existing.avatarColor ?? colorFromString(existing.alias),
        initials: existing.initials ?? getInitials(existing.alias)
      };

      await updateUser(nextUser);
      await reload({ includePreferences: false });
    },
    [users, reload]
  );

  const updateUserAlias = useCallback(
    async (userId: string, nextAlias: string) => {
      const existing = users.find((user) => user.id === userId);
      if (!existing) return;

      const clean = nextAlias.trim().slice(0, 40);
      if (!clean) return;

      let finalAlias = clean;
      let i = 2;
      while (
        users.some(
          (user) => user.id !== userId && user.alias.toLowerCase() === finalAlias.toLowerCase()
        )
      ) {
        finalAlias = `${clean}${i}`;
        i += 1;
      }

      const nextUser: User = {
        ...existing,
        alias: finalAlias,
        avatarColor: existing.avatarDataUrl ? undefined : colorFromString(finalAlias),
        initials: getInitials(finalAlias)
      };

      await updateUser(nextUser);
      await reload({ includePreferences: false });
    },
    [users, reload]
  );

  const updateUserLanguage = useCallback(
    async (userId: string, language: AppLanguage) => {
      const existing = users.find((user) => user.id === userId);
      if (!existing) return;
      if ((existing.language ?? "es") === language) return;
      await updateUser({ ...existing, language });
      await reload({ includePreferences: false });
    },
    [users, reload]
  );

  const updateUserRole = useCallback(
    async (userId: string, role: "admin" | "member") => {
      const target = users.find((user) => user.id === userId);
      if (!target) return;
      if ((target.role ?? "member") === role) return;

      if (role === "member") {
        const adminCount = users.filter((user) => user.role === "admin").length;
        if ((target.role ?? "member") === "admin" && adminCount <= 1) {
          throw new Error("LAST_ADMIN");
        }
      }

      await updateUser({ ...target, role });
      await reload({ includePreferences: false });
    },
    [users, reload]
  );

  const updatePreferences = useCallback(
    async (next: UserPreferences) => {
      await upsertPreferences(next);
      setPreferences(next);
    },
    []
  );

  const getPostsByTopic = useCallback(async (topic: string) => listPostsByTopic(topic), []);
  const getPostsByUser = useCallback(async (userId: string) => listPostsByUser(userId), []);
  const getUser = useCallback(async (userId: string) => getUserById(userId), []);

  const filterPosts = useCallback(
    (filters: SearchFilters, applyPreferenceRules = true) =>
      applyFilters(posts, filters, applyPreferenceRules ? preferences ?? undefined : undefined),
    [posts, preferences]
  );

  const exportJson = useCallback(async (): Promise<ExportBundle> => exportAllData(), []);

  const importJson = useCallback(
    async (bundle: ExportBundle): Promise<void> => {
      await importAllData(bundle);
      await reload();
    },
    [reload]
  );

  const userQualityValueById = useMemo(() => {
    const value = new Map<string, number>();
    const postsByUser = new Map<string, Post[]>();
    posts.forEach((post) => {
      postsByUser.set(post.userId, [...(postsByUser.get(post.userId) ?? []), post]);
    });

    users.forEach((user) => {
      const userPosts = postsByUser.get(user.id) ?? [];
      value.set(user.id, computeUserQualityScore(userPosts));
    });

    return value;
  }, [users, posts]);

  const userCommunityStatsById = useMemo(() => {
    const stats = new Map<string, UserCommunityStats>();
    const auraGivenByUser = new Map<string, number>();
    const commentAuraGivenByUser = new Map<string, number>();

    posts.forEach((post) => {
      (post.feedbacks ?? []).forEach((feedback) => {
        if (feedback.vote > 0) {
          auraGivenByUser.set(feedback.userId, (auraGivenByUser.get(feedback.userId) ?? 0) + 1);
        }
      });
      (post.comments ?? []).forEach((comment) => {
        (comment.auraUserIds ?? []).forEach((userId) => {
          commentAuraGivenByUser.set(userId, (commentAuraGivenByUser.get(userId) ?? 0) + 1);
        });
      });
    });

    users.forEach((user) => {
      const authoredPosts = posts.filter((post) => post.userId === user.id);
      const postCount = authoredPosts.length;
      const highQualityCount = authoredPosts.filter(
        (post) => post.qualityScore >= 75 && post.qualityLabel !== "clickbait"
      ).length;
      const authoredComments = posts.flatMap((post) =>
        (post.comments ?? []).filter((comment) => comment.userId === user.id)
      );

      const auraFromPostFeedback = authoredPosts.reduce((acc, post) => {
        return (
          acc +
          (post.feedbacks ?? []).reduce((sum, feedback) => sum + (feedback.vote > 0 ? 1 : -1), 0)
        );
      }, 0);

      const auraFromCommentFeedback = authoredComments.reduce((acc, comment) => {
        return acc + (comment.auraUserIds?.length ?? 0);
      }, 0);

      const auraReceived = auraFromPostFeedback + auraFromCommentFeedback;
      const auraGiven = (auraGivenByUser.get(user.id) ?? 0) + (commentAuraGivenByUser.get(user.id) ?? 0);

      const duplicatePenalty = authoredPosts.reduce((acc, post) => {
        const repeated = post.contributorCounts?.[user.id] ?? 1;
        return acc + Math.max(0, repeated - 1) * 7;
      }, 0);

      const qualityScore = userQualityValueById.get(user.id) ?? auraRuntimeConfig.userQuality.defaultScore;
      const commentCount = authoredComments.length;
      const pointsRaw =
        postCount * 5 +
        highQualityCount * 24 +
        commentCount * 3 +
        auraReceived * 6 +
        auraGiven * 2 +
        qualityScore * 1.2 -
        duplicatePenalty;

      const points = Math.max(0, Math.round(pointsRaw));
      const level = levelFromPoints(points);
      const currentLevelPoints = pointsForLevel(level);
      const nextLevelPoints = pointsForLevel(level + 1);
      const levelProgress =
        nextLevelPoints > currentLevelPoints
          ? (points - currentLevelPoints) / (nextLevelPoints - currentLevelPoints)
          : 1;

      const rankTitle =
        level >= 12 ? "Leyenda" :
        level >= 9 ? "Élite" :
        level >= 6 ? "Curador Pro" :
        level >= 4 ? "Colaborador" : "Inicial";

      const badges: string[] = [];
      if (highQualityCount >= 10) badges.push("Fuente fiable");
      if (commentCount >= 20) badges.push("Constructor de comunidad");
      if (auraReceived >= 40) badges.push("Pulso comunitario");
      if (qualityScore >= 80) badges.push("Señal fiable");

      stats.set(user.id, {
        userId: user.id,
        aura: auraReceived,
        points,
        level,
        rankTitle,
        badges,
        postCount,
        highQualityCount,
        commentCount,
        auraReceived,
        auraGiven,
        nextLevelPoints,
        levelProgress: Math.max(0, Math.min(1, levelProgress))
      });
    });

    return stats;
  }, [users, posts, userQualityValueById]);

  const userInfluenceAuraById = useMemo(() => {
    const value = new Map<string, number>();
    const postsByUser = new Map<string, Post[]>();
    posts.forEach((post) => {
      postsByUser.set(post.userId, [...(postsByUser.get(post.userId) ?? []), post]);
    });

    users.forEach((user) => {
      const authoredPosts = postsByUser.get(user.id) ?? [];
      const qualityScore = userQualityValueById.get(user.id) ?? auraRuntimeConfig.userQuality.defaultScore;
      value.set(user.id, computeUserInfluenceScore(authoredPosts, qualityScore));
    });

    return value;
  }, [users, posts, userQualityValueById]);

  return {
    users,
    posts,
    activeUser,
    activeUserId,
    globalSession,
    globalSettings,
    selectedCommunity,
    communityRulesText,
    communityMembers,
    communityOwnerId,
    loading,
    backendError,
    preferences,
    reload,
    loginWithUserId,
    loginGlobal,
    registerGlobal,
    logoutGlobal,
    fetchCommunities,
    setCommunityAsActive,
    saveGlobalSettings,
    createOrLogin,
    createCommunityFlow,
    previewCommunityInvite,
    confirmCommunityInvite,
    leaveCurrentCommunity,
    loadCommunityOverview,
    updateCommunityDetails,
    createCommunityInvite,
    logout,
    createPost,
    savePost,
    removePost,
    removeComment,
    removeUser,
    updatePostPrimaryTopic,
    renameTopicAcrossPosts,
    updateUserAvatar,
    updateUserAlias,
    updateUserLanguage,
    updateUserRole,
    getPostsByTopic,
    getPostsByUser,
    getUser,
    filterPosts,
    updatePreferences,
    exportJson,
    importJson,
    userQualityValueById,
    userCommunityStatsById,
    userInfluenceAuraById
  };
};
