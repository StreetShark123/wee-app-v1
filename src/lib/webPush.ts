// Web Push en el cliente: permiso del navegador, suscripción vía pushManager y
// envío de la suscripción al backend. La clave VAPID pública es pública (viaja a
// cada navegador), así que va aquí con override por env; la privada es secreto
// de la edge function. Ver src/lib/pushApi.ts para los endpoints.
import { registerPushSubscription, removePushSubscription } from "./communityApi";

const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ??
  "BF3Guyg53_hMPn6hsbq8Kj21F42IF3F53QpFmrvoQRgdMNyny7ELteq5wxeFkkFepMBsJ3VY6X6eFctUnRZUaNM";

// Categorías de notificación (deben coincidir con las del backend/push_prefs).
export type PushCategory = "replies" | "comments" | "milestones" | "chapters";
export interface PushPrefs {
  enabled: boolean;
  // Record<string,...> (no Record<PushCategory,...>) para que sea asignable al
  // payload de la API sin fricción de index-signature; se indexa con PushCategory.
  categories: Record<string, boolean>;
}
export const DEFAULT_PUSH_PREFS: PushPrefs = {
  enabled: false,
  categories: { replies: true, comments: false, milestones: true, chapters: false }
};

export const isPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
export const isIos = (): boolean => /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);

// PWA instalada (en iOS es REQUISITO para recibir push).
export const isStandalone = (): boolean =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

// En iOS, Web Push SOLO funciona con la PWA instalada en la pantalla de inicio.
export const iosNeedsInstall = (): boolean => isIos() && !isStandalone();

export const getPermission = (): NotificationPermission =>
  typeof Notification !== "undefined" ? Notification.permission : "denied";

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // ArrayBuffer explícito → Uint8Array<ArrayBuffer> (asignable a BufferSource;
  // el genérico ArrayBufferLike de TS 5.7 no lo es).
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

const subToJson = (sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } => {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? ""
  };
};

// ¿Hay ya una suscripción activa en este navegador?
export const getExistingSubscription = async (): Promise<PushSubscription | null> => {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
};

// Pide permiso, se suscribe y manda la suscripción al backend. Devuelve true si
// quedó activa. Lanza un Error con mensaje legible si el permiso se deniega.
export const enablePush = async (): Promise<boolean> => {
  if (!isPushSupported()) throw new Error("unsupported");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("denied");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
  }
  await registerPushSubscription(subToJson(sub));
  return true;
};

// Cancela la suscripción del navegador y avisa al backend para borrarla.
export const disablePush = async (): Promise<void> => {
  const sub = await getExistingSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch {
      /* da igual: igualmente lo borramos en el backend */
    }
    await removePushSubscription(endpoint).catch(() => undefined);
  }
};
