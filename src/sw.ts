/// <reference lib="webworker" />
// Service worker propio (vite-plugin-pwa injectManifest). Recrea el
// comportamiento del generateSW anterior (precache + navigateFallback + caché de
// portadas) y AÑADE Web Push (push + notificationclick). Excluido del tsc de la
// app (tsconfig) para no mezclar libs DOM/WebWorker; lo bundlea vite con esbuild.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// Precache de los assets del build (lista inyectada por vite-plugin-pwa).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA: cualquier navegación cae a index.html precacheado.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// Portadas de libros (remotas): se descargan UNA vez y luego de caché.
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "wee-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

// autoUpdate: activar la versión nueva sin esperar a que se cierren pestañas.
self.skipWaiting();
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Web Push ──────────────────────────────────────────────────────────────
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title || "wee.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Reutiliza una pestaña abierta de la app: la enfoca y navega al destino.
        if ("focus" in client) {
          void client.focus();
          if ("navigate" in client) void (client as WindowClient).navigate(target).catch(() => undefined);
          return;
        }
      }
      return self.clients.openWindow(target).then(() => undefined);
    })
  );
});
