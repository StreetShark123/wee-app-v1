import { AnimatePresence } from "framer-motion";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppFooter } from "./components/AppFooter";
import { CommunityLoadingScreen } from "./components/CommunityLoadingScreen";
import { Icon } from "./components/Icon";
import { PageTransition } from "./components/PageTransition";
import { ShareLinkModal } from "./components/ShareLinkModal";
import { AddBookModal } from "./components/AddBookModal";
import type { BookDraft } from "./lib/bookSearch";
import { createClubBook, listClubBooks, type ClubBook, type MemberBook } from "./lib/communityApi";
import { Toast } from "./components/Toast";
import { useAppData } from "./lib/appData";
import { classifyPost } from "./lib/classify";
import { I18nContext, pick } from "./lib/i18n";
import { deriveTitleFromUrl, displayTitle, isUnusableTitle } from "./lib/presentation";
import { enrichUrl } from "./lib/enrich";
import { NotificationsContext, type AppNotification } from "./lib/notifications";
import { trackComment, trackOpenSource, trackPageView, trackRate, trackShare } from "./lib/usageAnalytics";
import { listPosts as listPostsFromStore, reportPostById } from "./lib/store";
import { consumeRateLimit } from "./lib/rateLimit";
import type { AppLanguage, AuraRulesetVersion, ExportBundle } from "./lib/types";
import { canonicalizeUrl, duplicateUrlKeys, generateId, normalizeSpace, sha256Hex } from "./lib/utils";
import { resolveRootRoute, shouldAutoEnterDefaultCommunity } from "./lib/communityNavigation";
import { RequireAuth } from "./pages/RequireAuth";

const AuthPage = lazy(async () => ({ default: (await import("./pages/AuthPage")).AuthPage }));
const HomePage = lazy(async () => ({ default: (await import("./pages/HomePage")).HomePage }));
const BookDetailPage = lazy(async () => ({ default: (await import("./pages/BookDetailPage")).BookDetailPage }));
const TopicPage = lazy(async () => ({ default: (await import("./pages/TopicPage")).TopicPage }));
const PostDetailPage = lazy(async () => ({ default: (await import("./pages/PostDetailPage")).PostDetailPage }));
const SharePage = lazy(async () => ({ default: (await import("./pages/SharePage")).SharePage }));
const ProfilePage = lazy(async () => ({ default: (await import("./pages/ProfilePage")).ProfilePage }));
const UserPostsPage = lazy(async () => ({ default: (await import("./pages/UserPostsPage")).UserPostsPage }));
const SettingsPage = lazy(async () => ({ default: (await import("./pages/SettingsPage")).SettingsPage }));
const CommunityPage = lazy(async () => ({ default: (await import("./pages/CommunityPage")).CommunityPage }));
const CommunitiesPickerPage = lazy(async () => ({ default: (await import("./pages/CommunitiesPickerPage")).CommunitiesPickerPage }));
const InvitePage = lazy(async () => ({ default: (await import("./pages/InvitePage")).InvitePage }));
const JoinPage = lazy(async () => ({ default: (await import("./pages/JoinPage")).JoinPage }));

const AppRoutes = () => {
  const location = useLocation();
  const {
    users,
    posts,
    activeUser,
    globalSession,
    globalSettings,
    selectedCommunity,
    communityRulesText,
    communityMembers,
    preferences,
    loading,
    backendError,
    loginGlobal,
    registerGlobal,
    logoutGlobal,
    fetchCommunities,
    setCommunityAsActive,
    saveGlobalSettings,
    createCommunityFlow,
    previewCommunityInvite,
    confirmCommunityInvite,
    leaveCurrentCommunity,
    loadCommunityOverview,
    updateCommunityDetails,
    createCommunityInvite,
    loginWithUserId,
    logout,
    createPost,
    savePost,
    removePost,
    removeComment,
    removeUser,
    updateUserAvatar,
    updateUserAlias,
    updatePostPrimaryTopic,
    filterPosts,
    updatePreferences,
    exportJson,
    importJson,
    userQualityValueById,
    userCommunityStatsById,
    userInfluenceAuraById
  } = useAppData();

  const [toast, setToast] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [books, setBooks] = useState<ClubBook[]>([]);
  const [memberBooks, setMemberBooks] = useState<MemberBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [notificationsReadAt, setNotificationsReadAt] = useState(0);
  const [myCommunities, setMyCommunities] = useState<Array<{ community_id: string; name: string; description?: string; role: "admin" | "member" }>>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [autoEnteringDefaultCommunity, setAutoEnteringDefaultCommunity] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const autoEnterAttempts = useRef<Set<string>>(new Set());
  // App en español único (de momento): el selector de idioma se ha retirado.
  const language: AppLanguage = "es";

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (!activeUser) return;
    void loadCommunityOverview().catch(() => undefined);
  }, [activeUser, loadCommunityOverview]);

  const reloadBooks = useCallback(async () => {
    if (!activeUser) {
      setBooks([]);
      setMemberBooks([]);
      return;
    }
    setBooksLoading(true);
    try {
      const data = await listClubBooks();
      setBooks(data.books);
      setMemberBooks(data.memberBooks);
    } catch {
      setBooks([]);
      setMemberBooks([]);
    } finally {
      setBooksLoading(false);
    }
  }, [activeUser]);

  useEffect(() => {
    void reloadBooks();
  }, [reloadBooks]);

  const reloadMyCommunities = useCallback(async () => {
    if (!globalSession) {
      setMyCommunities([]);
      setCommunitiesLoading(false);
      return;
    }
    setCommunitiesLoading(true);
    try {
      const data = await fetchCommunities();
      setMyCommunities(data.communities);
    } catch {
      setMyCommunities([]);
    } finally {
      setCommunitiesLoading(false);
    }
  }, [fetchCommunities, globalSession]);

  useEffect(() => {
    void reloadMyCommunities();
  }, [reloadMyCommunities]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const raf = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname]);

  const shouldKeepLoaderVisible =
    autoEnteringDefaultCommunity ||
    (loading && !activeUser) ||
    (Boolean(globalSession) && location.pathname === "/home" && !activeUser);

  useEffect(() => {
    if (shouldKeepLoaderVisible) {
      setShowLoadingOverlay(true);
      return;
    }
    const timeout = window.setTimeout(() => setShowLoadingOverlay(false), 920);
    return () => window.clearTimeout(timeout);
  }, [shouldKeepLoaderVisible]);

  useEffect(() => {
    if (!globalSession || activeUser || loading || communitiesLoading) return;
    const params = new URLSearchParams(location.search);
    const hasInviteOrCodeQuery = Boolean(params.get("invite") || params.get("code"));
    const canAutoEnter = shouldAutoEnterDefaultCommunity({
      skipPicker: globalSettings.skipPicker,
      defaultCommunityId: globalSettings.defaultCommunityId,
      availableCommunityIds: myCommunities.map((entry) => entry.community_id),
      hasInviteQuery: hasInviteOrCodeQuery
    });
    if (!canAutoEnter || !globalSettings.defaultCommunityId) return;
    const attemptKey = `${globalSession.sessionToken}:${globalSettings.defaultCommunityId}`;
    if (autoEnterAttempts.current.has(attemptKey)) return;
    autoEnterAttempts.current.add(attemptKey);
    setAutoEnteringDefaultCommunity(true);
    void setCommunityAsActive(globalSettings.defaultCommunityId)
      .catch(() => undefined)
      .finally(() => setAutoEnteringDefaultCommunity(false));
  }, [
    activeUser,
    communitiesLoading,
    globalSession,
    globalSettings.defaultCommunityId,
    globalSettings.skipPicker,
    loading,
    location.search,
    myCommunities,
    setCommunityAsActive
  ]);

  const knownTopics = useMemo(
    () => Array.from(new Set(posts.flatMap((post) => post.topics))).sort(),
    [posts]
  );
  const memberRemovedMode = import.meta.env.VITE_MEMBER_REMOVED_POSTS_MODE === "collapsed" ? "collapsed" : "hidden";
  const postsForViewer = useMemo(() => {
    if (!activeUser) return posts;
    if (activeUser.role === "admin") return posts;
    return posts
      .filter((post) => (memberRemovedMode === "hidden" ? post.status !== "removed" : true))
      .map((post) => {
        if (memberRemovedMode === "collapsed" && post.status === "removed") {
          return {
            ...post,
            status: "collapsed" as const,
            title: pick(language, "Contenido moderado", "Moderated content"),
            text: pick(language, "Este libro fue moderado por administración.", "This post was moderated by admins."),
            previewTitle: undefined,
            previewDescription: undefined,
            previewImageUrl: undefined,
            url: undefined
          };
        }
        return post;
      });
  }, [posts, activeUser, memberRemovedMode, language]);
  const notificationsStorageKey = activeUser ? `wee:notifications:last-read:${activeUser.id}` : "";
  useEffect(() => {
    if (!activeUser) {
      setNotificationsReadAt(0);
      return;
    }
    try {
      const stored = Number(localStorage.getItem(notificationsStorageKey) ?? "0");
      setNotificationsReadAt(Number.isFinite(stored) ? stored : 0);
    } catch {
      setNotificationsReadAt(0);
    }
  }, [activeUser, notificationsStorageKey]);

  const notifications = useMemo((): AppNotification[] => {
    if (!activeUser) return [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const rows: AppNotification[] = [];

    posts.forEach((post) => {
      if (post.userId !== activeUser.id) return;
      const postTitle = displayTitle(post);

      (post.feedbacks ?? []).forEach((feedback) => {
        if (feedback.userId === activeUser.id) return;
        const actor = usersById.get(feedback.userId);
        rows.push({
          id: `${post.id}:vote:${feedback.userId}:${feedback.votedAt}`,
          type: "post_aura",
          postId: post.id,
          postTitle,
          actorId: feedback.userId,
          actorAlias: actor?.alias ?? pick(language, "Usuario", "User", "Usuario"),
          createdAt: feedback.votedAt ?? post.createdAt,
          vote: feedback.vote
        });
      });

      (post.comments ?? []).forEach((comment) => {
        if (comment.userId === activeUser.id) return;
        const actor = usersById.get(comment.userId);
        rows.push({
          id: `${post.id}:comment:${comment.id}`,
          type: "post_comment",
          postId: post.id,
          postTitle,
          actorId: comment.userId,
          actorAlias: actor?.alias ?? pick(language, "Usuario", "User", "Usuario"),
          createdAt: comment.createdAt
        });
      });
    });

    return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 60);
  }, [activeUser, posts, users, language]);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => notification.createdAt > notificationsReadAt).length,
    [notifications, notificationsReadAt]
  );

  const markAllNotificationsAsRead = (): void => {
    if (!activeUser) return;
    const markAt = Date.now();
    setNotificationsReadAt(markAt);
    try {
      localStorage.setItem(notificationsStorageKey, String(markAt));
    } catch {
      // ignore storage restrictions
    }
  };
  const duplicateLookup = useMemo(() => {
    const map = new Map<string, (typeof posts)[number]>();
    posts.forEach((post) => {
      duplicateUrlKeys(post.canonicalUrl ?? post.url).forEach((key) => {
        if (!map.has(key)) map.set(key, post);
      });
    });
    return map;
  }, [posts]);

  const sourceOpenSessionKey = (userId: string, postId: string): string =>
    `wee:source-opened:${userId}:${postId}`;
  const markSourceOpenedSession = (userId: string, postId: string): void => {
    try {
      window.sessionStorage.setItem(sourceOpenSessionKey(userId, postId), "1");
    } catch {
      // ignore storage restrictions
    }
  };
  const hasSourceOpenedSession = (userId: string, postId: string): boolean => {
    try {
      return window.sessionStorage.getItem(sourceOpenSessionKey(userId, postId)) === "1";
    } catch {
      return false;
    }
  };

  const onExport = async (): Promise<void> => {
    const data = await exportJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `news-curation-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast(pick(language, "Copia de seguridad exportada en JSON.", "Backup exported as JSON."));
    window.setTimeout(() => setToast(null), 1800);
  };

  const onImport = async (file: File): Promise<void> => {
    const text = await file.text();
    const bundle = JSON.parse(text) as ExportBundle;
    await importJson(bundle);
    setToast(pick(language, "Importación completada. Ya tienes los datos cargados.", "Import completed. Your data is now loaded."));
    window.setTimeout(() => setToast(null), 1800);
  };

  const onDeleteMyData = async (): Promise<void> => {
    if (!activeUser) return;
    const userId = activeUser.id;
    await removeUser(userId);
    logout();
    showToast(pick(language, "Tus datos se han borrado del club.", "Your data has been deleted.", "Elimináronse os teus datos."));
  };

  const findDuplicatePost = (url: string) => {
    const incomingKeys = duplicateUrlKeys(url);
    if (!incomingKeys.length) return undefined;
    for (const key of incomingKeys) {
      const found = duplicateLookup.get(key);
      if (found) return found;
    }
    return undefined;
  };

  const getContentHashFromFlags = (flags: string[] | undefined): string | undefined => {
    const entry = (flags ?? []).find((flag) => flag.startsWith("content_hash:"));
    return entry?.slice("content_hash:".length);
  };

  const findDuplicateByContentHash = (contentHash: string) =>
    posts.find((post) => getContentHashFromFlags(post.flags) === contentHash);

  const rulesetVersion: AuraRulesetVersion =
    import.meta.env.VITE_AURA_RULESET_VERSION === "v2" ? "v2" : "v1";
  const topicRulesetVersion = import.meta.env.VITE_TOPIC_RULESET_VERSION === "v2" ? "v2" : "v1";

  const getDuplicatePreview = (
    url: string
  ): { exists: boolean; sameUser: boolean; contributors: number; totalShares: number } => {
    if (!activeUser) return { exists: false, sameUser: false, contributors: 0, totalShares: 0 };
    const existing = findDuplicatePost(url);
    if (!existing) return { exists: false, sameUser: false, contributors: 0, totalShares: 0 };
    const counts = existing.contributorCounts ?? { [existing.userId]: existing.shareCount ?? 1 };
    return {
      exists: true,
      sameUser: (counts[activeUser.id] ?? 0) > 0,
      contributors: Object.keys(counts).length,
      totalShares: Object.values(counts).reduce((acc, value) => acc + value, 0)
    };
  };

  const formatRetry = (seconds: number): string => {
    const safe = Math.max(1, Math.round(seconds));
    if (safe < 60) return `${safe}s`;
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  };

  const onShareUrl = async (
    url: string,
    options?: { forceTopic?: string }
  ): Promise<{ mode: "created" | "merged" | "penalized"; message: string; debugBreakdown?: unknown; topicDebug?: unknown }> => {
    if (!activeUser) return { mode: "created", message: pick(language, "Entra para recomendar libros.", "Sign in to share links.") };
    const canonical = canonicalizeUrl(url);
    const existing = findDuplicatePost(url);
    const debugMode = new URLSearchParams(window.location.search).get("debug") === "1";

    if (existing) {
      const counts = { ...(existing.contributorCounts ?? { [existing.userId]: existing.shareCount ?? 1 }) };
      counts[activeUser.id] = (counts[activeUser.id] ?? 0) + 1;
      const contributorUserIds = Array.from(new Set([...(existing.contributorUserIds ?? [existing.userId]), activeUser.id]));
      const shareCount = Object.values(counts).reduce((acc, value) => acc + value, 0);
      const sameUserDuplicate = counts[activeUser.id] > 1;
      const feedbacks = existing.feedbacks ?? [];
      const hasFeedbackFromSharer = feedbacks.some((entry) => entry.userId === activeUser.id);
      const nextFeedbacks = hasFeedbackFromSharer
        ? feedbacks
        : [...feedbacks, { userId: activeUser.id, vote: 1 as const, votedAt: Date.now() }];

      const forcedTopic = options?.forceTopic?.trim().toLowerCase().replace(/\s+/g, "-");
      const nextTopics =
        forcedTopic && !existing.topics.includes(forcedTopic)
          ? [forcedTopic, ...existing.topics].slice(0, 6)
          : existing.topics;
      await savePost({
        ...existing,
        canonicalUrl: canonical ?? existing.canonicalUrl,
        contributorCounts: counts,
        contributorUserIds,
        shareCount,
        feedbacks: nextFeedbacks,
        topics: nextTopics,
        rationale: sameUserDuplicate
          ? existing.rationale.includes("Enlace repetido por el mismo usuario; se aplica penalización interna")
            ? existing.rationale
            : [...existing.rationale, "Enlace repetido por el mismo usuario; se aplica penalización interna"]
          : existing.rationale
      });

      trackShare({
        mode: sameUserDuplicate ? "penalized" : "merged",
        sourceDomain: existing.sourceDomain,
        primaryTopic: existing.topics?.[0]
      });

      return {
        mode: sameUserDuplicate ? "penalized" : "merged",
        message: sameUserDuplicate
          ? pick(language, "Ese libro ya lo habías recomendado. Lo dejamos en el mismo hilo para mantener orden y contexto.", "You already shared this link. We keep it in the same thread to avoid duplicates and keep context.")
          : pick(language, `Ese libro ya estaba en el club: lo sumamos al mismo hilo (${contributorUserIds.length} colaboradores).`, `This link already existed: merged into the same thread (${contributorUserIds.length} contributors).`)
      };
    }

    const createdAt = Date.now();
    let metadata: Awaited<ReturnType<typeof enrichUrl>>;
    try {
      metadata = await enrichUrl(url);
    } catch {
      metadata = {
        title: undefined,
        description: undefined,
        imageUrl: undefined,
        siteName: undefined,
        author: undefined,
        publisher: undefined,
        publishedAt: undefined,
        schemaTypes: [],
        hasImprintOrContact: false,
        outboundUrls: [],
        bodyText: undefined,
        hasOverlayPopup: false,
        adLikeNodeRatio: 0,
        articleSection: undefined,
        newsKeywords: [],
        parselySection: undefined,
        sailthruTags: [],
        breadcrumbs: [],
        relTags: [],
        jsonLdSections: [],
        jsonLdKeywords: [],
        jsonLdAbout: [],
        jsonLdGenre: [],
        jsonLdIsPartOf: []
      };
    }
    const safeMetadataTitle = metadata.title && !isUnusableTitle(metadata.title) ? metadata.title : undefined;
    const derivedTitle = safeMetadataTitle ?? deriveTitleFromUrl(url) ?? pick(language, "Libro recomendado", "Shared post");
    const description = metadata.description;
    const contentHash = await sha256Hex(normalizeSpace(`${derivedTitle ?? ""} ${description ?? ""}`));
    const duplicateByContent = findDuplicateByContentHash(contentHash);
    if (duplicateByContent) {
      const counts = { ...(duplicateByContent.contributorCounts ?? { [duplicateByContent.userId]: duplicateByContent.shareCount ?? 1 }) };
      counts[activeUser.id] = (counts[activeUser.id] ?? 0) + 1;
      const contributorUserIds = Array.from(new Set([...(duplicateByContent.contributorUserIds ?? [duplicateByContent.userId]), activeUser.id]));
      const shareCount = Object.values(counts).reduce((acc, value) => acc + value, 0);
      const sameUserDuplicate = counts[activeUser.id] > 1;
      const feedbacks = duplicateByContent.feedbacks ?? [];
      const hasFeedbackFromSharer = feedbacks.some((entry) => entry.userId === activeUser.id);
      const nextFeedbacks = hasFeedbackFromSharer
        ? feedbacks
        : [...feedbacks, { userId: activeUser.id, vote: 1 as const, votedAt: Date.now() }];

      await savePost({
        ...duplicateByContent,
        canonicalUrl: canonical ?? duplicateByContent.canonicalUrl,
        contributorCounts: counts,
        contributorUserIds,
        shareCount,
        feedbacks: nextFeedbacks,
        rationale: sameUserDuplicate
          ? duplicateByContent.rationale.includes("Duplicado por hash de contenido; se aplica penalización interna")
            ? duplicateByContent.rationale
            : [...duplicateByContent.rationale, "Duplicado por hash de contenido; se aplica penalización interna"]
          : duplicateByContent.rationale
      });

      trackShare({
        mode: sameUserDuplicate ? "penalized" : "merged",
        sourceDomain: duplicateByContent.sourceDomain,
        primaryTopic: duplicateByContent.topics?.[0]
      });

      return {
        mode: sameUserDuplicate ? "penalized" : "merged",
        message: pick(
          language,
          `Ese libro ya estaba en otro enlace. Lo unimos al mismo hilo (${contributorUserIds.length} colaboradores).`,
          `This content already existed under another link. Merged into the same thread (${contributorUserIds.length} contributors).`
        )
      };
    }

    const postLimit = await consumeRateLimit("create_post", activeUser.id);
    if (!postLimit.allowed) {
      const retry = formatRetry(postLimit.retryAfterSec);
      return {
        mode: "created",
        message: pick(
          language,
          `Vas demasiado rápido recomendando. Espera ${retry} y vuelve a intentarlo.`,
          `You're posting too fast. Wait ${retry} and try again.`
        )
      };
    }

    const classified = classifyPost(
      {
        url,
        title: derivedTitle,
        text: description,
        rulesetVersion,
        topicRulesetVersion,
        debug: debugMode,
        metadata: {
          publisher: metadata.publisher,
          author: metadata.author,
          schemaTypes: metadata.schemaTypes,
          hasImprintOrContact: metadata.hasImprintOrContact,
          outboundUrls: metadata.outboundUrls,
          bodyText: metadata.bodyText,
          hasOverlayPopup: metadata.hasOverlayPopup,
          adLikeNodeRatio: metadata.adLikeNodeRatio,
          publishedAt: metadata.publishedAt,
          articleSection: metadata.articleSection,
          newsKeywords: metadata.newsKeywords,
          parselySection: metadata.parselySection,
          sailthruTags: metadata.sailthruTags,
          breadcrumbs: metadata.breadcrumbs,
          relTags: metadata.relTags,
          jsonLdSections: metadata.jsonLdSections,
          jsonLdKeywords: metadata.jsonLdKeywords,
          jsonLdAbout: metadata.jsonLdAbout,
          jsonLdGenre: metadata.jsonLdGenre,
          jsonLdIsPartOf: metadata.jsonLdIsPartOf,
          duplicateSignals: {
            canonicalExists: Boolean(existing),
            contentHashExists: Boolean(duplicateByContent)
          }
        }
      },
      createdAt
    );
    const forcedTopic = options?.forceTopic?.trim().toLowerCase().replace(/\s+/g, "-");
    const finalTopics =
      forcedTopic && !classified.topics.includes(forcedTopic)
        ? [forcedTopic, ...classified.topics].slice(0, 6)
        : classified.topics;

    await createPost({
      id: generateId(),
      userId: activeUser.id,
      createdAt,
      canonicalUrl: canonical,
      url,
      title: derivedTitle,
      text: description,
      previewTitle: safeMetadataTitle,
      previewDescription: metadata.description,
      previewImageUrl: metadata.imageUrl,
      previewSiteName: metadata.siteName,
      sourceDomain: classified.sourceDomain,
      extractedHosts: classified.extractedHosts,
      shareCount: 1,
      contributorUserIds: [activeUser.id],
      contributorCounts: { [activeUser.id]: 1 },
      feedbacks: [{ userId: activeUser.id, vote: 1 as const, votedAt: createdAt }],
      topics: finalTopics,
      subtopics: classified.subtopics,
      topicV2: classified.topicV2,
      topicCandidatesV2: classified.topicCandidatesV2,
      topicExplanationV2: classified.topicExplanationV2,
      topicVersion: classified.topicVersion,
      qualityLabel: classified.qualityLabel,
      qualityScore: classified.qualityScore,
      interestScore: classified.interestScore,
      flags: Array.from(new Set([...classified.flags, `content_hash:${contentHash}`])),
      rationale: classified.rationale,
      normalizedText: classified.normalizedText
    });

    if (debugMode && classified.debugBreakdown) {
      const payload = {
        url,
        domain: classified.sourceDomain ?? "unknown",
        aura: classified.interestScore,
        fired_rules: classified.debugBreakdown.firedRules
      };
      console.info("aura_index_debug", payload);
      (window as Window & { __WEE_LAST_AURA_DEBUG__?: unknown }).__WEE_LAST_AURA_DEBUG__ = classified.debugBreakdown;
    }
    if (classified.topicExplanationV2) {
      const topicPayload = {
        url,
        domain: classified.sourceDomain ?? "unknown",
        topic_v2: classified.topicV2 ?? "general",
        candidates_top3: (classified.topicCandidatesV2 ?? []).slice(0, 3),
        fired_signals: classified.topicExplanationV2.reasons.slice(0, 8).map((reason) => reason.signal)
      };
      console.info("topic_classification_v2", topicPayload);
      if (debugMode) {
        (window as Window & { __WEE_LAST_TOPIC_DEBUG__?: unknown }).__WEE_LAST_TOPIC_DEBUG__ = classified.topicExplanationV2;
      }
    }

    trackShare({
      mode: "created",
      sourceDomain: classified.sourceDomain,
      primaryTopic: classified.topics[0]
    });

    return {
      mode: "created",
      message: pick(
        language,
        `Publicado en ${finalTopics[0] ?? "misc"} · Aura ${classified.interestScore}.`,
        `Posted in ${finalTopics[0] ?? "misc"} · Aura ${classified.interestScore}.`,
        `Publicado en ${finalTopics[0] ?? "misc"} · Aura ${classified.interestScore}.`
      ),
      debugBreakdown: debugMode ? classified.debugBreakdown : undefined,
      topicDebug: debugMode
        ? {
            topic_v2: classified.topicV2,
            topic_candidates_v2: classified.topicCandidatesV2,
            topic_explanation_v2: classified.topicExplanationV2
          }
        : undefined
    };
  };

  const onQuickShare = async (url: string): Promise<void> => {
    const result = await onShareUrl(url);
    showToast(result.message);
  };

  const onOpenExternalSource = async (postId: string): Promise<void> => {
    if (!activeUser) return;
    markSourceOpenedSession(activeUser.id, postId);
    const post = posts.find((entry) => entry.id === postId) ?? (await listPostsFromStore()).find((entry) => entry.id === postId);
    if (!post) return;
    const openedBy = new Set(post.openedByUserIds ?? []);
    openedBy.add(activeUser.id);
    // Fire-and-forget persistence; local session mark already unlocks voting UX immediately.
    void savePost({ ...post, openedByUserIds: Array.from(openedBy) }).catch(() => undefined);
    trackOpenSource({ sourceDomain: post.sourceDomain, primaryTopic: post.topics?.[0] });
  };

  const onRatePost = async (postId: string, vote: 1 | -1): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser) return { ok: false, message: pick(language, "Entra para votar.", "Sign in to vote.") };
    const voteLimit = await consumeRateLimit("vote_post", activeUser.id);
    if (!voteLimit.allowed) {
      const retry = formatRetry(voteLimit.retryAfterSec);
      return {
        ok: false,
        message: pick(
          language,
          `Vas muy rápido valorando. Espera ${retry} y vuelve a probar.`,
          `You're rating too fast. Wait ${retry} and try again.`
        )
      };
    }
    let post = posts.find((entry) => entry.id === postId);
    if (!post) return { ok: false, message: pick(language, "No encontramos este libro.", "We could not find this post.") };

    let opened = (post.openedByUserIds ?? []).includes(activeUser.id) || hasSourceOpenedSession(activeUser.id, postId);
    if (!opened) {
      // Avoid race condition: source can be opened but React state may still be stale.
      const latest = (await listPostsFromStore()).find((entry) => entry.id === postId);
      if (latest) {
        post = latest;
        opened = (latest.openedByUserIds ?? []).includes(activeUser.id) || hasSourceOpenedSession(activeUser.id, postId);
      }
    }

    if (!opened) {
      return { ok: false, message: pick(language, "Antes de votar, abre la fuente.", "Open the source before voting.") };
    }

    const feedbacks = post.feedbacks ?? [];
    const existing = feedbacks.find((item) => item.userId === activeUser.id);
    const nextFeedbacks = existing
      ? feedbacks.map((item) => (item.userId === activeUser.id ? { ...item, vote, votedAt: Date.now() } : item))
      : [...feedbacks, { userId: activeUser.id, vote, votedAt: Date.now() }];

    await savePost({ ...post, feedbacks: nextFeedbacks });
    trackRate({ vote, sourceDomain: post.sourceDomain, primaryTopic: post.topics?.[0] });
    return { ok: true, message: vote > 0 ? pick(language, "Voto guardado. Aura subiendo.", "Vote saved. Aura going up.") : pick(language, "Voto guardado. Aura bajando.", "Vote saved. Aura going down.") };
  };

  const onAddComment = async (
    postId: string,
    text: string
  ): Promise<{ ok: boolean; message: string; post?: (typeof posts)[number] }> => {
    if (!activeUser) return { ok: false, message: pick(language, "Entra para comentar.", "Sign in to comment.") };
    const commentLimit = await consumeRateLimit("create_comment", activeUser.id);
    if (!commentLimit.allowed) {
      const retry = formatRetry(commentLimit.retryAfterSec);
      return {
        ok: false,
        message: pick(
          language,
          `Vas muy rápido comentando. Espera ${retry} y vuelve a intentarlo.`,
          `You're commenting too fast. Wait ${retry} and try again.`
        )
      };
    }
    const post = posts.find((entry) => entry.id === postId);
    if (!post) return { ok: false, message: pick(language, "No encontramos este libro.", "We could not find this post.") };
    const clean = text.trim().slice(0, 320);
    if (!clean) return { ok: false, message: pick(language, "Escribe algo antes de enviar.", "Write something before sending.") };

    const nextPost = {
      ...post,
      comments: [
        ...(post.comments ?? []),
        {
          id: generateId(),
          userId: activeUser.id,
          text: clean,
          createdAt: Date.now(),
          auraUserIds: []
        }
      ]
    };
    await savePost(nextPost);
    trackComment({ sourceDomain: post.sourceDomain, primaryTopic: post.topics?.[0], length: clean.length });
    return { ok: true, message: pick(language, "Comentario enviado. Hilo al día.", "Comment posted. Thread updated."), post: nextPost };
  };

  const onVoteCommentAura = async (
    postId: string,
    commentId: string
  ): Promise<{ ok: boolean; message: string; post?: (typeof posts)[number] }> => {
    if (!activeUser) return { ok: false, message: pick(language, "Entra para valorar comentarios.", "Sign in to rate comments.") };
    const post = posts.find((entry) => entry.id === postId);
    if (!post) return { ok: false, message: pick(language, "No encontramos este libro.", "We could not find this post.") };

    const comments = post.comments ?? [];
    const target = comments.find((item) => item.id === commentId);
    if (!target) return { ok: false, message: pick(language, "No encontramos ese comentario.", "We could not find that comment.") };

    const voted = new Set(target.auraUserIds ?? []);
    const hasVoted = voted.has(activeUser.id);
    if (hasVoted) {
      voted.delete(activeUser.id);
    } else {
      voted.add(activeUser.id);
    }

    const nextComments = comments.map((item) =>
      item.id === commentId ? { ...item, auraUserIds: Array.from(voted) } : item
    );

    const nextPost = { ...post, comments: nextComments };
    await savePost(nextPost);
    return {
      ok: true,
      message: hasVoted
        ? pick(language, "Has retirado tu aura.", "Aura removed.")
        : pick(language, "Aura enviada. Este comentario sube un poco.", "Aura sent. This comment gets a visibility boost."),
      post: nextPost
    };
  };

  const onAdminDeleteComment = async (
    postId: string,
    commentId: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    const post = posts.find((entry) => entry.id === postId);
    const target = post?.comments?.find((comment) => comment.id === commentId);
    if (!target) {
      return { ok: false, message: pick(language, "No encontramos ese comentario.", "We could not find that comment.") };
    }
    if (target.userId !== activeUser.id) {
      return {
        ok: false,
        message: pick(
          language,
          "Con el SQL v2 actual, solo puedes eliminar tus propios comentarios.",
          "With current SQL v2, you can only delete your own comments."
        )
      };
    }
    await removeComment(postId, commentId);
    return { ok: true, message: pick(language, "Comentario eliminado.", "Comment deleted.") };
  };

  const onAdminDeletePost = async (postId: string): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    const post = posts.find((entry) => entry.id === postId);
    if (!post) return { ok: false, message: pick(language, "No encontramos este libro.", "We could not find this post.") };
    if (post.userId !== activeUser.id) {
      return {
        ok: false,
        message: pick(
          language,
          "Con el SQL v2 actual, solo puedes eliminar libros propios.",
          "With current SQL v2, you can only delete your own posts."
        )
      };
    }
    await removePost(postId);
    return { ok: true, message: pick(language, "Libro eliminado.", "Post deleted.") };
  };

  const onReportPost = async (postId: string, reason: string): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser) return { ok: false, message: pick(language, "Entra para reportar.", "Sign in to report.") };
    const cleanReason = reason.trim().slice(0, 280);
    if (!cleanReason) {
      return { ok: false, message: pick(language, "Cuéntanos un motivo breve.", "Please add a short reason.") };
    }
    try {
      await reportPostById(postId, activeUser.id, cleanReason);
      return { ok: true, message: pick(language, "Reporte enviado. Gracias por cuidar el club.", "Report sent. Thanks for helping the community.") };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.toLowerCase().includes("duplicate")) {
        return { ok: false, message: pick(language, "Ya habías reportado este libro.", "You already reported this post.") };
      }
      return { ok: false, message: pick(language, "No pudimos enviar el reporte ahora.", "Could not send report right now.") };
    }
  };

  const onAdminModeratePost = async (
    postId: string,
    status: "active" | "collapsed" | "removed",
    reason: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    const post = posts.find((entry) => entry.id === postId);
    if (!post) return { ok: false, message: pick(language, "No encontramos este libro.", "We could not find this post.") };
    const trimmedReason = reason.trim().slice(0, 220);
    const moderated = {
      ...post,
      status,
      removedBy: status === "active" ? undefined : activeUser.id,
      removedAt: status === "active" ? undefined : Date.now(),
      removedReason: status === "active" ? undefined : trimmedReason || undefined
    };
    await savePost(moderated);
    return {
      ok: true,
      message:
        status === "active"
          ? pick(language, "Libro reactivado.", "Post reactivated.")
          : status === "collapsed"
            ? pick(language, "Libro colapsado.", "Post collapsed.")
            : pick(language, "Libro retirado.", "Post removed.")
    };
  };

  const onAdminUpdatePostTopic = async (
    postId: string,
    nextTopic: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    if (!nextTopic.trim()) {
      return { ok: false, message: pick(language, "Tema no válido.", "Invalid topic.") };
    }
    const post = posts.find((entry) => entry.id === postId);
    if (!post) return { ok: false, message: pick(language, "No encontramos este libro.", "We could not find this post.") };
    if (post.userId !== activeUser.id) {
      return {
        ok: false,
        message: pick(
          language,
          "Con el SQL v2 actual, solo puedes editar temas de libros propios.",
          "With current SQL v2, you can only edit topics on your own posts."
        )
      };
    }
    await updatePostPrimaryTopic(postId, nextTopic);
    return { ok: true, message: pick(language, "Tema del libro actualizado.", "Post topic updated.") };
  };

  const onAddPostTopic = async (
    postId: string,
    nextTopicRaw: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser) {
      return { ok: false, message: pick(language, "Entra para editar temas.", "Sign in to edit topics.") };
    }
    const post = posts.find((entry) => entry.id === postId);
    if (!post) {
      return { ok: false, message: pick(language, "No encontramos este libro.", "We could not find this post.") };
    }
    const nextTopic = normalizeSpace(nextTopicRaw).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 36);
    if (!nextTopic) {
      return { ok: false, message: pick(language, "Tema no válido.", "Invalid topic.") };
    }
    if (post.topics.includes(nextTopic)) {
      return { ok: false, message: pick(language, "Ese tema ya está añadido.", "That topic is already added.") };
    }
    if (post.userId !== activeUser.id) {
      return {
        ok: false,
        message: pick(
          language,
          "Con el SQL v2 actual, solo puedes añadir temas en libros propios.",
          "With current SQL v2, you can only add topics on your own posts."
        )
      };
    }
    const nextTopics = [nextTopic, ...post.topics].slice(0, 6);
    await savePost({
      ...post,
      topics: nextTopics,
      rationale: post.rationale.includes(`Tema añadido por usuarios: ${nextTopic}`)
        ? post.rationale
        : [...post.rationale, `Tema añadido por usuarios: ${nextTopic}`]
    });
    return { ok: true, message: pick(language, "Tema añadido al libro.", "Topic added to post.") };
  };

  const onAdminRenameTopic = async (
    fromTopic: string,
    toTopic: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    if (!fromTopic.trim() || !toTopic.trim() || fromTopic.trim() === toTopic.trim()) {
      return { ok: false, message: pick(language, "Tema no válido.", "Invalid topic.") };
    }
    return {
      ok: false,
      message: pick(
        language,
        "Renombrar temas globalmente requiere permisos backend adicionales (admin SQL v3).",
        "Global topic rename requires additional backend permissions (admin SQL v3)."
      )
    };
  };

  const onAdminDeleteUser = async (userId: string): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    if (userId === activeUser.id) {
      return { ok: false, message: pick(language, "No puedes eliminar tu propio usuario admin.", "You cannot delete your own admin user.") };
    }
    return {
      ok: false,
      message: pick(
        language,
        "Eliminar otros usuarios requiere permisos backend adicionales (admin SQL v3).",
        "Deleting other users requires additional backend permissions (admin SQL v3)."
      )
    };
  };

  const onAdminSetUserRole = async (
    userId: string,
    role: "admin" | "member"
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    return {
      ok: false,
      message: pick(
        language,
        "Cambiar roles requiere permisos backend adicionales (admin SQL v3).",
        "Changing roles requires additional backend permissions (admin SQL v3)."
      )
    };
  };

  const showToast = (message: string): void => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  // Alta de libro en el club activo. Va por la edge function community-api
  // (/books/create, service_role), que inserta en `books` con community_id.
  const onAddBook = async (book: BookDraft): Promise<void> => {
    if (!selectedCommunity) throw new Error("Entra en un club antes de añadir libros.");
    const { book: created } = await createClubBook({
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      description: book.description,
      publishedYear: book.publishedYear,
      pageCount: book.pageCount,
      source: book.source,
      manuallyEdited: book.manuallyEdited
    });
    await reloadBooks();
    showToast(`"${created.title}" añadido al club.`);
  };

  if (showLoadingOverlay) {
    return (
      <I18nContext.Provider value={{ language }}>
        <NotificationsContext.Provider
          value={{
            notifications: [],
            unreadCount: 0,
            lastReadAt: 0,
            markAllAsRead: () => {}
          }}
        >
          <CommunityLoadingScreen
            communityName={selectedCommunity?.name}
            topics={Array.from(new Set(posts.flatMap((post) => post.topics))).slice(0, 3)}
            usersCount={users.length}
            finishing={!shouldKeepLoaderVisible}
          />
        </NotificationsContext.Provider>
      </I18nContext.Provider>
    );
  }

  if (backendError) {
    const backendErrorMessage =
      backendError === "BACKEND_CONFIG_MISSING"
        ? pick(
            language,
            "Este despliegue necesita backend remoto y le faltan variables de Supabase. Revisa VITE_SUPABASE_* en Vercel.",
            "This deployment needs a remote backend and is missing Supabase env vars. Check VITE_SUPABASE_* in Vercel.",
            "Este despregue necesita backend remoto e faltan variables de Supabase. Revisa VITE_SUPABASE_* en Vercel."
          )
        : backendError === "BACKEND_AUTH_FAILED"
          ? pick(
              language,
              "No tenemos permiso para hablar con el backend. Revisa claves públicas y sesión de Supabase.",
              "Backend access is not authorized. Check Supabase public keys and session.",
              "Non temos permiso para falar co backend. Revisa claves públicas e sesión de Supabase."
            )
          : backendError === "BACKEND_UNREACHABLE"
            ? pick(
                language,
                "No pudimos conectar con el backend. Revisa red, proyecto de Supabase y Edge Functions.",
                "Could not connect to backend. Check network, Supabase project and Edge Functions.",
                "Non puidemos conectar co backend. Revisa rede, proxecto de Supabase e Edge Functions."
              )
            : pick(
                language,
                "El backend respondió con un error raro. Mira los logs de Supabase para más detalle.",
                "Backend returned an unexpected error. Check Supabase logs for details.",
                "O backend respondeu cun erro raro. Mira os logs de Supabase para máis detalle."
              );
    return (
      <I18nContext.Provider value={{ language }}>
        <NotificationsContext.Provider
          value={{
            notifications: [],
            unreadCount: 0,
            lastReadAt: 0,
            markAllAsRead: () => {}
          }}
        >
          <main className="page-section narrow">
            <h2>{pick(language, "Error de conexión con el backend", "Backend connection error", "Erro de conexión co backend")}</h2>
            <p className="warning">{backendErrorMessage}</p>
          </main>
        </NotificationsContext.Provider>
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ language }}>
      <NotificationsContext.Provider
        value={{
          notifications,
          unreadCount: unreadNotifications,
          lastReadAt: notificationsReadAt,
          markAllAsRead: markAllNotificationsAsRead
        }}
      >
        <Suspense
          fallback={
            <CommunityLoadingScreen
              communityName={selectedCommunity?.name}
              topics={Array.from(new Set(posts.flatMap((post) => post.topics))).slice(0, 3)}
              usersCount={users.length}
              finishing={false}
            />
          }
        >
        <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
        <Route
          path="/login"
          element={
            globalSession ? (
              <Navigate
                to={
                  new URLSearchParams(location.search).get("invite") || new URLSearchParams(location.search).get("code")
                    ? `/join${location.search}`
                    : activeUser
                      ? "/home"
                      : "/communities"
                }
                replace
              />
            ) : (
              <PageTransition>
                <AuthPage
                  mode="login"
                  onLogin={async (username, password) => {
                    await loginGlobal(username, password);
                  }}
                  onRegister={async (username, password, email) => {
                    await registerGlobal(username, password, email);
                  }}
                />
              </PageTransition>
            )
          }
        />

        <Route
          path="/signup"
          element={
            globalSession ? (
              <Navigate
                to={
                  new URLSearchParams(location.search).get("invite") || new URLSearchParams(location.search).get("code")
                    ? `/join${location.search}`
                    : activeUser
                      ? "/home"
                      : "/communities"
                }
                replace
              />
            ) : (
              <PageTransition>
                <AuthPage
                  mode="signup"
                  onLogin={async (username, password) => {
                    await loginGlobal(username, password);
                  }}
                  onRegister={async (username, password, email) => {
                    await registerGlobal(username, password, email);
                  }}
                />
              </PageTransition>
            )
          }
        />

        <Route
          path="/invite/:token"
          element={
            <PageTransition>
              <InvitePage
                isLoggedIn={Boolean(globalSession)}
                onPreviewCommunity={previewCommunityInvite}
                onConfirmCommunity={confirmCommunityInvite}
                onEnterCommunity={setCommunityAsActive}
              />
            </PageTransition>
          }
        />

        <Route
          path="/communities"
          element={
            globalSession ? (
              activeUser ? (
                <Navigate to="/home" replace />
              ) : (
                <PageTransition>
                  <CommunitiesPickerPage
                    communities={myCommunities}
                    loading={communitiesLoading}
                    defaultCommunityId={globalSettings.defaultCommunityId}
                    skipPicker={globalSettings.skipPicker}
                    onReload={reloadMyCommunities}
                    onEnterCommunity={setCommunityAsActive}
                    onCreateCommunity={createCommunityFlow}
                    onSaveSettings={saveGlobalSettings}
                    onLogout={logoutGlobal}
                  />
                </PageTransition>
              )
            ) : <Navigate to={`/login${location.search}`} replace />
          }
        />

        <Route
          path="/join"
          element={
            <PageTransition>
              <JoinPage
                isLoggedIn={Boolean(globalSession)}
                onPreviewCommunity={previewCommunityInvite}
                onJoinCommunity={confirmCommunityInvite}
                onEnterCommunity={setCommunityAsActive}
                onReloadCommunities={reloadMyCommunities}
              />
            </PageTransition>
          }
        />

        <Route
          path="/home"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <HomePage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  books={books}
                  memberBooks={memberBooks}
                  booksLoading={booksLoading}
                  onOpenAddBook={() => setBookModalOpen(true)}
                  onLogout={logoutGlobal}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/book/:bookId"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <BookDetailPage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  onOpenAddBook={() => setBookModalOpen(true)}
                  onLogout={logoutGlobal}
                  onBooksChanged={reloadBooks}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/topic/:topic"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <TopicPage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  users={users}
                  posts={postsForViewer}
                  userInfluenceAuraById={userInfluenceAuraById}
                  onOpenShareModal={() => setShareModalOpen(true)}
                  onLogout={logoutGlobal}
                  activeUserId={activeUser?.id ?? null}
                  onAddComment={onAddComment}
                  onVoteCommentAura={onVoteCommentAura}
                  onAdminDeleteComment={onAdminDeleteComment}
                  onAdminRenameTopic={onAdminRenameTopic}
                  onShareUrl={onShareUrl}
                  onToast={showToast}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/post/:postId"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <PostDetailPage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  users={users}
                  posts={postsForViewer}
                  onOpenShareModal={() => setShareModalOpen(true)}
                  onLogout={logoutGlobal}
                  activeUserId={activeUser?.id ?? null}
                  onOpenExternalSource={onOpenExternalSource}
                  onRatePost={onRatePost}
                  onAddComment={onAddComment}
                  onVoteCommentAura={onVoteCommentAura}
                  onAdminDeleteComment={onAdminDeleteComment}
                  onAdminDeletePost={onAdminDeletePost}
                  onAdminUpdatePostTopic={onAdminUpdatePostTopic}
                  onAddPostTopic={onAddPostTopic}
                  onReportPost={onReportPost}
                  onAdminModeratePost={onAdminModeratePost}
                  onToast={showToast}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/share"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <SharePage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  onShareUrl={onShareUrl}
                  getDuplicatePreview={getDuplicatePreview}
                  onToast={showToast}
                  onLogout={logoutGlobal}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/profile/:userId"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <ProfilePage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  users={users}
                  posts={postsForViewer}
                  userCommunityStatsById={userCommunityStatsById}
                  onLogout={logoutGlobal}
                  onUpdateAvatar={updateUserAvatar}
                  onUpdateAlias={updateUserAlias}
                  onDeleteUser={onAdminDeleteUser}
                  onSetUserRole={onAdminSetUserRole}
                  onToast={showToast}
                  onOpenShareModal={() => setShareModalOpen(true)}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/profile/:userId/posts"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <UserPostsPage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  users={users}
                  posts={postsForViewer}
                  onDeletePost={removePost}
                  onToast={showToast}
                  onOpenShareModal={() => setShareModalOpen(true)}
                  onLogout={logoutGlobal}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/settings"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <SettingsPage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  preferences={preferences}
                  knownTopics={knownTopics}
                  onSave={updatePreferences}
                  onExport={onExport}
                  onImport={onImport}
                  onDeleteMyData={onDeleteMyData}
                  onOpenShareModal={() => setShareModalOpen(true)}
                  onLogout={logoutGlobal}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/community"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <CommunityPage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  selectedCommunity={selectedCommunity}
                  members={communityMembers}
                  communities={myCommunities}
                  rulesText={communityRulesText}
                  onUpdateCommunity={updateCommunityDetails}
                  onCreateInvite={createCommunityInvite}
                  onSwitchCommunity={setCommunityAsActive}
                  onLeaveCommunity={leaveCurrentCommunity}
                  onLogout={logoutGlobal}
                  onOpenShareModal={() => setShareModalOpen(true)}
                  onToast={showToast}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route path="/" element={<Navigate to={resolveRootRoute({ hasGlobalSession: Boolean(globalSession), hasActiveCommunitySession: Boolean(activeUser) })} replace />} />
        <Route path="*" element={<Navigate to={resolveRootRoute({ hasGlobalSession: Boolean(globalSession), hasActiveCommunitySession: Boolean(activeUser) })} replace />} />
        </Routes>
        </AnimatePresence>
        </Suspense>
        {activeUser && location.pathname.startsWith("/home") ? (
          <button
            type="button"
            className="mobile-share-fab"
            onClick={() => setBookModalOpen(true)}
            aria-label={pick(language, "Añadir un libro", "Add a book", "Engadir un libro")}
            title={pick(language, "Añadir un libro", "Add a book", "Engadir un libro")}
          >
            <Icon name="plus" size={18} />
          </button>
        ) : null}
        <Toast message={toast} />
        <ShareLinkModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          onShareUrl={onShareUrl}
          getDuplicatePreview={getDuplicatePreview}
          onToast={showToast}
        />
        <AddBookModal
          open={bookModalOpen}
          onClose={() => setBookModalOpen(false)}
          onAddBook={onAddBook}
          onToast={showToast}
        />
        {activeUser ? <AppFooter /> : null}
      </NotificationsContext.Provider>
    </I18nContext.Provider>
  );
};

export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </HashRouter>
  );
}
