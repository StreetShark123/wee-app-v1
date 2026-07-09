import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { CommunityLoadingScreen } from "./components/CommunityLoadingScreen";
import { DockNav } from "./components/DockNav";
import { Icon } from "./components/Icon";
import { Masthead } from "./components/Masthead";
import { PageTransition } from "./components/PageTransition";
import { PullToRefresh } from "./components/PullToRefresh";
import { AddBookModal } from "./components/AddBookModal";
import type { BookDraft } from "./lib/bookSearch";
import { createClubBook, demoteMember, exportMyData, joinPublicCommunity, listClubBooks, listNotifications, markNotificationsRead, previewCommunityBySlug, promoteMember, removeMember, requestJoinCommunity, type ClubBook, type MemberBook } from "./lib/communityApi";
import { clearBooksCache, getCachedList, setCachedList } from "./lib/booksCache";
import { isFresh, markFetched } from "./lib/freshness";
import { Toast } from "./components/Toast";
import { useAppData } from "./lib/appData";
import { I18nContext, pick } from "./lib/i18n";
import { NotificationsContext, type AppNotification } from "./lib/notifications";
import { trackPageView } from "./lib/usageAnalytics";
import type { AppLanguage } from "./lib/types";
import { resolveRootRoute, shouldAutoEnterDefaultCommunity } from "./lib/communityNavigation";
import { RequireAuth } from "./pages/RequireAuth";

const AuthPage = lazy(async () => ({ default: (await import("./pages/AuthPage")).AuthPage }));
const HomePage = lazy(async () => ({ default: (await import("./pages/HomePage")).HomePage }));
const BookDetailPage = lazy(async () => ({ default: (await import("./pages/BookDetailPage")).BookDetailPage }));
const ProfilePage = lazy(async () => ({ default: (await import("./pages/ProfilePage")).ProfilePage }));
const FeedPage = lazy(async () => ({ default: (await import("./pages/FeedPage")).FeedPage }));
const MePage = lazy(async () => ({ default: (await import("./pages/MePage")).MePage }));
const SettingsPage = lazy(async () => ({ default: (await import("./pages/SettingsPage")).SettingsPage }));
const CommunityPage = lazy(async () => ({ default: (await import("./pages/CommunityPage")).CommunityPage }));
const CommunitiesPickerPage = lazy(async () => ({ default: (await import("./pages/CommunitiesPickerPage")).CommunitiesPickerPage }));
const InvitePage = lazy(async () => ({ default: (await import("./pages/InvitePage")).InvitePage }));
const JoinPage = lazy(async () => ({ default: (await import("./pages/JoinPage")).JoinPage }));
const ResetPasswordPage = lazy(async () => ({ default: (await import("./pages/ResetPasswordPage")).ResetPasswordPage }));
const ClubLandingPage = lazy(async () => ({ default: (await import("./pages/ClubLandingPage")).ClubLandingPage }));

// Splash: tiempo mínimo en pantalla (deja que el "wee." acabe de teclearse,
// 0.85s + 0.1s de delay en CSS) y duración del fade de salida (casa con el
// CSS `is-finishing`).
const MIN_SPLASH_MS = 1000;
const SPLASH_FADE_MS = 440;

const AppRoutes = () => {
  const location = useLocation();
  const {
    users,
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
    updateUserAvatar,
    updateUserAlias,
    updatePreferences,
    exportJson,
    reload,
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
  // Fase de salida del splash: dispara el fade CSS mientras la web ya está montada
  // detrás, para revelarla sin fogonazo en blanco.
  const [loaderFinishing, setLoaderFinishing] = useState(false);
  const bootStartRef = useRef(Date.now());
  // Tope de seguridad: por muy lento (o roto) que vaya el backend, soltamos el
  // splash pasado este tiempo y caemos a skeletons antes que atrapar al usuario.
  const [loaderMaxReached, setLoaderMaxReached] = useState(false);
  const autoEnterAttempts = useRef<Set<string>>(new Set());
  // App en español único (de momento): el selector de idioma se ha retirado.
  const language: AppLanguage = "es";

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  // Prefetch en idle del chunk de la ficha de libro (la navegación más común desde
  // la Home): así al tocar un libro no esperas a descargar su JS (el spinner de ruta).
  useEffect(() => {
    const prefetch = () => {
      void import("./pages/BookDetailPage");
    };
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(prefetch);
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(prefetch, 1200);
    return () => window.clearTimeout(t);
  }, []);

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

  // Tirar-para-refrescar: refresca los datos base del club (reload) y avisa a la
  // pantalla activa (evento `wee:refresh`) para que Feed/ficha recarguen lo suyo.
  const handlePullRefresh = useCallback(async () => {
    window.dispatchEvent(new Event("wee:refresh"));
    try {
      await Promise.all([reload(), reloadBooks()]);
    } catch {
      /* sin red: el gesto termina igual, sin romper nada */
    }
  }, [reload, reloadBooks]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const raf = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname]);

  // Mientras corre la animación del logo, esperamos también a que el contenido
  // del destino (la lista de libros de la Home) esté listo, para entrar SIN
  // skeletons. El debounce de 920ms de abajo cubre la ventana de arranque en la
  // que `reloadBooks` aún no ha puesto `booksLoading` en true.
  const waitingForHomeContent =
    Boolean(activeUser) &&
    location.pathname === "/home" &&
    booksLoading &&
    books.length === 0;

  const shouldKeepLoaderVisible =
    !loaderMaxReached &&
    (autoEnteringDefaultCommunity ||
      (loading && !activeUser) ||
      (Boolean(globalSession) && location.pathname === "/home" && !activeUser) ||
      waitingForHomeContent);

  useEffect(() => {
    if (shouldKeepLoaderVisible) {
      setShowLoadingOverlay(true);
      setLoaderFinishing(false);
      return;
    }
    // Contenido listo y ya montado DETRÁS del overlay. Respeta el mínimo en
    // pantalla, luego funde el splash y, al terminar el fade, lo desmonta. Como
    // la web está pintada detrás, el fundido la revela sin hueco en blanco.
    const elapsed = Date.now() - bootStartRef.current;
    const untilFade = Math.max(0, MIN_SPLASH_MS - elapsed);
    const fadeTimer = window.setTimeout(() => setLoaderFinishing(true), untilFade);
    const unmountTimer = window.setTimeout(() => setShowLoadingOverlay(false), untilFade + SPLASH_FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [shouldKeepLoaderVisible]);

  // Tope absoluto desde el montaje: si el contenido no llega a tiempo, dejamos
  // de retener el splash y la app entra mostrando skeletons.
  useEffect(() => {
    const cap = window.setTimeout(() => setLoaderMaxReached(true), 5000);
    return () => window.clearTimeout(cap);
  }, []);

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

  const reloadNotifications = useCallback(async (force = false) => {
    if (!activeUser) {
      setNotifications([]);
      setUnreadNotifications(0);
      return;
    }
    // Ventana de frescura (30s): los eventos de foco llegan a pares en iOS y
    // cada uno disparaba una llamada; si el dato es reciente, no gastamos red.
    if (!force && isFresh("notifications", 30000)) return;
    try {
      const data = await listNotifications();
      markFetched("notifications");
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
    // Sondeo periódico para que lleguen sin tener que refocalizar la pestaña.
    // Solo cuando la pestaña está visible (no gastar en background).
    const poll = window.setInterval(() => {
      if (!document.hidden) void reloadNotifications(true);
    }, 180000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(poll);
    };
  }, [reloadNotifications]);

  const markAllNotificationsAsRead = useCallback((): void => {
    if (!activeUser) return;
    setUnreadNotifications(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() })));
    void markNotificationsRead().catch(() => undefined);
  }, [activeUser]);

  const i18nValue = useMemo(() => ({ language }), [language]);

  // Destino de la pestaña "Lectura" del dock: el libro en curso (el destacado
  // en oro primero); sin lectura activa, el dock cae a la estantería.
  const currentReadingBookId = useMemo(() => {
    const reading = books.filter((b) => b.status === "reading");
    if (reading.length === 0) return null;
    return (reading.find((b) => b.featured === "gold") ?? reading[0]).id;
  }, [books]);
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


  const onAdminDeleteUser = async (userId: string): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    if (userId === activeUser.id) {
      return { ok: false, message: pick(language, "No puedes eliminar tu propio usuario admin.", "You cannot delete your own admin user.") };
    }
    try {
      await removeMember(userId);
      return { ok: true, message: pick(language, "Usuario eliminado del club.", "User removed from the club.") };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : pick(language, "No se pudo eliminar al usuario.", "Couldn't remove the user.") };
    }
  };

  const onAdminSetUserRole = async (
    userId: string,
    role: "admin" | "member"
  ): Promise<{ ok: boolean; message: string }> => {
    if (!activeUser || activeUser.role !== "admin") {
      return { ok: false, message: pick(language, "Esta acción es solo para admin.", "This action is admin-only.") };
    }
    try {
      if (role === "admin") await promoteMember(userId);
      else await demoteMember(userId);
      return {
        ok: true,
        message: role === "admin"
          ? pick(language, "Ahora es admin del club.", "They're now a club admin.")
          : pick(language, "Ya no es admin.", "They're no longer an admin.")
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : pick(language, "No se pudo cambiar el rol.", "Couldn't change the role.") };
    }
  };

  // Identidad ESTABLE (useCallback []): showToast baja como prop a efectos con
  // deps (p.ej. la búsqueda del AddBookModal). Sin esto, cada render creaba una
  // función nueva → el efecto se relanzaba → si la búsqueda fallaba, el toast
  // re-renderizaba → bucle de peticiones al backend.
  const showToast = useCallback((message: string): void => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

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
      authorUrl: book.authorUrl,
      source: book.source,
      manuallyEdited: book.manuallyEdited,
      proposalNote: book.proposalNote || null
    });
    await reloadBooks();
    showToast(`"${created.title}" añadido al club.`);
  };

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
        {activeUser && !showLoadingOverlay ? <Masthead communityName={selectedCommunity?.name} /> : null}
        {activeUser && !showLoadingOverlay ? <PullToRefresh onRefresh={handlePullRefresh} /> : null}
        <Suspense fallback={<div className="route-fallback" aria-busy="true"><span className="route-spinner" /></div>}>
        {/* Sin AnimatePresence: el modo "wait" + startTransition + chunks lazy
            perdía la entrada de la página nueva si un re-render caía durante la
            salida (quedaba la página vieja con el hash nuevo). Las tabs deben
            ser instantáneas; PageTransition conserva la entrada suave. */}
        <Routes location={location} key={location.pathname}>
        {/* Restablecer contraseña (pública, desde el enlace que genera un admin). */}
        <Route path="/reset" element={<PageTransition><ResetPasswordPage /></PageTransition>} />
        <Route
          path="/login"
          element={
            globalSession ? (
              <Navigate
                to={
                  new URLSearchParams(location.search).get("club")
                    ? `/c/${new URLSearchParams(location.search).get("club")}`
                    : new URLSearchParams(location.search).get("invite") || new URLSearchParams(location.search).get("code")
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
                  new URLSearchParams(location.search).get("club")
                    ? `/c/${new URLSearchParams(location.search).get("club")}`
                    : new URLSearchParams(location.search).get("invite") || new URLSearchParams(location.search).get("code")
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
          path="/c/:slug"
          element={
            <PageTransition>
              <ClubLandingPage
                isLoggedIn={Boolean(globalSession)}
                onPreviewBySlug={previewCommunityBySlug}
                onJoinPublic={joinPublicCommunity}
                onRequestJoin={requestJoinCommunity}
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
                  canAddBook={activeUser?.role === "admin" || selectedCommunity?.bookPolicy !== "admins_only"}
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
                  communityName={selectedCommunity?.name}
                  onExport={onExport}
                  onLogout={logoutGlobal}
                  onToast={showToast}
                />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/feed"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <FeedPage />
              </PageTransition>
            </RequireAuth>
          }
        />

        <Route
          path="/me"
          element={
            <RequireAuth activeUser={activeUser} redirectPath={globalSession ? "/communities" : "/login"}>
              <PageTransition>
                <MePage
                  activeUser={activeUser as NonNullable<typeof activeUser>}
                  onUpdateAvatar={updateUserAvatar}
                  onUpdateAlias={updateUserAlias}
                  onToast={showToast}
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
        </Suspense>
        </AppErrorBoundary>
        {/* Shell de app: cabecera del club arriba, dock de navegación abajo.
            El colofón (antiguo footer) vive ahora al pie de la página "Tú". */}
        {activeUser && !showLoadingOverlay ? <DockNav currentBookId={currentReadingBookId} /> : null}
        <Toast message={toast} />
        <AddBookModal
          open={bookModalOpen}
          onClose={() => setBookModalOpen(false)}
          onAddBook={onAddBook}
          onToast={showToast}
        />
        {showLoadingOverlay ? (
          <CommunityLoadingScreen finishing={loaderFinishing} />
        ) : null}
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
