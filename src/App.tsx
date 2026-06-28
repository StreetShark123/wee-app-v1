import { AnimatePresence } from "framer-motion";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AppFooter } from "./components/AppFooter";
import { CommunityLoadingScreen } from "./components/CommunityLoadingScreen";
import { Icon } from "./components/Icon";
import { PageTransition } from "./components/PageTransition";
import { AddBookModal } from "./components/AddBookModal";
import type { BookDraft } from "./lib/bookSearch";
import { createClubBook, exportMyData, listClubBooks, listNotifications, markNotificationsRead, type ClubBook, type MemberBook } from "./lib/communityApi";
import { clearBooksCache, getCachedList, setCachedList } from "./lib/booksCache";
import { Toast } from "./components/Toast";
import { useAppData } from "./lib/appData";
import { I18nContext, pick } from "./lib/i18n";
import { NotificationsContext, type AppNotification } from "./lib/notifications";
import { trackPageView } from "./lib/usageAnalytics";
import type { AppLanguage, ExportBundle } from "./lib/types";
import { resolveRootRoute, shouldAutoEnterDefaultCommunity } from "./lib/communityNavigation";
import { RequireAuth } from "./pages/RequireAuth";

const AuthPage = lazy(async () => ({ default: (await import("./pages/AuthPage")).AuthPage }));
const HomePage = lazy(async () => ({ default: (await import("./pages/HomePage")).HomePage }));
const BookDetailPage = lazy(async () => ({ default: (await import("./pages/BookDetailPage")).BookDetailPage }));
const ProfilePage = lazy(async () => ({ default: (await import("./pages/ProfilePage")).ProfilePage }));
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
    communityOwnerId,
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
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
      clearBooksCache();
      setBooks([]);
      setMemberBooks([]);
      return;
    }
    // Stale-while-revalidate: pinta lo cacheado al instante, revalida detrás.
    const cached = getCachedList(activeUser.id);
    if (cached) {
      setBooks(cached.books);
      setMemberBooks(cached.memberBooks);
    } else {
      setBooksLoading(true);
    }
    try {
      const data = await listClubBooks();
      setBooks(data.books);
      setMemberBooks(data.memberBooks);
      setCachedList(activeUser.id, { books: data.books, memberBooks: data.memberBooks });
    } catch {
      if (!cached) {
        setBooks([]);
        setMemberBooks([]);
      }
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
  const reloadNotifications = useCallback(async () => {
    if (!activeUser) {
      setNotifications([]);
      setUnreadNotifications(0);
      return;
    }
    try {
      const data = await listNotifications();
      setNotifications(data.notifications);
      setUnreadNotifications(data.unreadCount);
    } catch {
      // notificaciones best-effort
    }
  }, [activeUser]);

  useEffect(() => {
    void reloadNotifications();
    const onFocus = () => void reloadNotifications();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadNotifications]);

  const markAllNotificationsAsRead = useCallback((): void => {
    if (!activeUser) return;
    setUnreadNotifications(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
    void markNotificationsRead().catch(() => undefined);
  }, [activeUser]);

  const i18nValue = useMemo(() => ({ language }), [language]);
  const notificationsValue = useMemo(
    () => ({ notifications, unreadCount: unreadNotifications, markAllAsRead: markAllNotificationsAsRead }),
    [notifications, unreadNotifications, markAllNotificationsAsRead]
  );

  const onExport = async (): Promise<void> => {
    // Solo TUS datos (perfil + tus comentarios/notas/progreso/valoraciones), nunca los de otros.
    const data = await exportMyData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wee-export-${new Date().toISOString().slice(0, 10)}.json`;
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
    await removeUser(activeUser.id);
    logout();
    showToast(pick(language, "Tus datos se han borrado del club.", "Your data has been deleted.", "Elimináronse os teus datos."));
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
      manuallyEdited: book.manuallyEdited,
      proposalNote: book.proposalNote || null
    });
    await reloadBooks();
    showToast(`"${created.title}" añadido al club.`);
  };

  if (showLoadingOverlay) {
    return (
      <I18nContext.Provider value={i18nValue}>
        <NotificationsContext.Provider
          value={{
            notifications: [],
            unreadCount: 0,
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
      <I18nContext.Provider value={i18nValue}>
        <NotificationsContext.Provider
          value={{
            notifications: [],
            unreadCount: 0,
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
    <I18nContext.Provider value={i18nValue}>
      <NotificationsContext.Provider value={notificationsValue}>
        <AppErrorBoundary>
        <Suspense fallback={<div className="route-fallback" aria-busy="true"><span className="route-spinner" /></div>}>
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
          path="/profile/:userId"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <ProfilePage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  users={users}
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
          path="/settings"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <SettingsPage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
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
                  ownerId={communityOwnerId}
                  communities={myCommunities}
                  rulesText={communityRulesText}
                  onUpdateCommunity={updateCommunityDetails}
                  onCreateInvite={createCommunityInvite}
                  onSwitchCommunity={setCommunityAsActive}
                  onLeaveCommunity={leaveCurrentCommunity}
                  onSetUserRole={onAdminSetUserRole}
                  onDeleteUser={onAdminDeleteUser}
                  onRefreshMembers={loadCommunityOverview}
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
        {activeUser ? <AppFooter /> : null}
        </Suspense>
        </AppErrorBoundary>
        <Toast message={toast} />
        <AddBookModal
          open={bookModalOpen}
          onClose={() => setBookModalOpen(false)}
          onAddBook={onAddBook}
          onToast={showToast}
        />
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
