import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { pick, useI18n } from "../lib/i18n";
import { getPushPrefs, setPushPrefs } from "../lib/communityApi";
import {
  DEFAULT_PUSH_PREFS,
  disablePush,
  enablePush,
  getExistingSubscription,
  getPermission,
  iosNeedsInstall,
  isPushSupported,
  type PushCategory,
  type PushPrefs
} from "../lib/webPush";

// Panel "Notificaciones" (MePage). Web Push opt-in: toggle maestro (pide permiso
// y suscribe) + casillas por tipo. Las prefs viven en el backend porque el envío
// es server-side. En iOS exige la PWA instalada (aviso explícito).
const CATEGORIES: PushCategory[] = ["replies", "comments", "milestones", "chapters"];

export const PushSettings = () => {
  const { language } = useI18n();
  const supported = isPushSupported();
  const needsInstall = iosNeedsInstall();
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PUSH_PREFS);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void (async () => {
      const sub = await getExistingSubscription();
      const granted = getPermission() === "granted";
      if (!alive) return;
      setActive(Boolean(sub) && granted);
      try {
        const p = await getPushPrefs();
        if (alive) setPrefs({ enabled: p.enabled, categories: { ...DEFAULT_PUSH_PREFS.categories, ...(p.categories as PushPrefs["categories"]) } });
      } catch {
        /* aún sin prefs: se quedan los defaults */
      }
    })();
    return () => {
      alive = false;
    };
  }, [supported]);

  const catLabel = (c: PushCategory): { title: string; hint: string } => {
    switch (c) {
      case "replies":
        return { title: pick(language, "Respuestas y menciones", "Replies and mentions", "Respostas e mencións"), hint: pick(language, "Cuando te responden, te mencionan o comentan tu nota.", "When someone replies, mentions you or comments your note.", "Cando che responden, mencionan ou comentan a túa nota.") };
      case "comments":
        return { title: pick(language, "Comentarios en tus lecturas", "Comments on your reads", "Comentarios nas túas lecturas"), hint: pick(language, "Comentarios nuevos en libros que estás leyendo.", "New comments on books you're reading.", "Comentarios novos en libros que estás a ler.") };
      case "milestones":
        return { title: pick(language, "Hitos del club", "Club milestones", "Fitos do club"), hint: pick(language, "Libro terminado, propuesta para votar, cita de reunión.", "Book finished, proposal to vote, meeting date.", "Libro rematado, proposta para votar, cita de reunión.") };
      default:
        return { title: pick(language, "Avance de capítulo", "Chapter progress", "Avance de capítulo"), hint: pick(language, "Cuando el club avanza o termina capítulos.", "When the club advances or finishes chapters.", "Cando o club avanza ou remata capítulos.") };
    }
  };

  const toggleMaster = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!active) {
        await enablePush();
        const next = { ...prefs, enabled: true };
        await setPushPrefs(next);
        setPrefs(next);
        setActive(true);
      } else {
        await disablePush();
        const next = { ...prefs, enabled: false };
        await setPushPrefs(next).catch(() => undefined);
        setPrefs(next);
        setActive(false);
      }
    } catch (e) {
      setError((e as Error).message === "denied"
        ? pick(language, "Permiso denegado. Actívalo en los ajustes del navegador.", "Permission denied. Enable it in your browser settings.", "Permiso denegado. Actívao nos axustes do navegador.")
        : pick(language, "No se pudo activar. Inténtalo de nuevo.", "Couldn't enable it. Try again.", "Non se puido activar. Téntao de novo."));
    } finally {
      setBusy(false);
    }
  };

  const toggleCategory = async (c: PushCategory) => {
    const next: PushPrefs = { ...prefs, categories: { ...prefs.categories, [c]: !prefs.categories[c] } };
    setPrefs(next);
    await setPushPrefs(next).catch(() => undefined);
  };

  return (
    <section className="page-section push-settings">
      <div className="section-head"><h3><Icon name="bell" /> {pick(language, "Notificaciones", "Notifications", "Notificacións")}</h3></div>

      {!supported ? (
        <p className="hint">{pick(language, "Tu navegador no admite notificaciones push.", "Your browser doesn't support push notifications.", "O teu navegador non admite notificacións push.")}</p>
      ) : needsInstall ? (
        <p className="hint">{pick(language, "En iPhone/iPad, instala primero la app en tu pantalla de inicio (Compartir → «Añadir a inicio») para poder recibir notificaciones.", "On iPhone/iPad, first install the app to your home screen (Share → \"Add to Home Screen\") to receive notifications.", "En iPhone/iPad, instala primeiro a app na pantalla de inicio (Compartir → «Engadir a inicio») para recibir notificacións.")}</p>
      ) : (
        <>
          <p className="hint">{pick(language, "Recibe avisos del club aunque no tengas la app abierta. Tú eliges qué llega.", "Get club alerts even when the app is closed. You choose what arrives.", "Recibe avisos do club aínda que non teñas a app aberta. Ti escolles que chega.")}</p>

          <button type="button" className={`a11y-toggle${active ? " is-on" : ""}`} aria-pressed={active} disabled={busy} onClick={() => void toggleMaster()}>
            <span className="a11y-toggle-text">
              <strong>{active
                ? pick(language, "Notificaciones activadas", "Notifications on", "Notificacións activadas")
                : pick(language, "Activar notificaciones", "Turn on notifications", "Activar notificacións")}</strong>
              <span className="hint">{pick(language, "Se pedirá permiso al navegador.", "Your browser will ask for permission.", "Pediráselle permiso ao navegador.")}</span>
            </span>
            <span className="a11y-switch" aria-hidden="true" />
          </button>

          {error ? <p className="hint push-error">{error}</p> : null}

          {active ? (
            <div className="push-categories">
              {CATEGORIES.map((c) => {
                const { title, hint } = catLabel(c);
                const on = prefs.categories[c];
                return (
                  <button key={c} type="button" className={`a11y-toggle${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => void toggleCategory(c)}>
                    <span className="a11y-toggle-text">
                      <strong>{title}</strong>
                      <span className="hint">{hint}</span>
                    </span>
                    <span className="a11y-switch" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};
