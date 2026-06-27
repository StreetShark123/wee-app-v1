import { AnimatePresence, motion } from "framer-motion";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { pick, useI18n } from "../lib/i18n";
import { EASE_STANDARD, MOTION_DURATION } from "../lib/motion";
import { Icon } from "./Icon";

interface ShareLinkModalProps {
  open: boolean;
  onClose: () => void;
  onShareUrl: (url: string) => Promise<{ mode: "created" | "merged" | "penalized"; message: string }>;
  getDuplicatePreview: (url: string) => { exists: boolean; sameUser: boolean; contributors: number; totalShares: number };
  onToast: (message: string) => void;
}

export const ShareLinkModal = ({ open, onClose, onShareUrl, getDuplicatePreview, onToast }: ShareLinkModalProps) => {
  const { language } = useI18n();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const duplicateState = getDuplicatePreview(url.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = url.trim();
    if (!clean || submitting) return;
    setSubmitting(true);
    try {
      const result = await onShareUrl(clean);
      onToast(result.message);
      onClose();
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : pick(
              language,
              "Ups, no se pudo añadir al club ahora. Prueba otra vez.",
              "Oops, couldn't post right now. Try again.",
              "Ups, non se puido publicar agora. Proba outra vez."
            )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-overlay modal-overlay-share"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION_DURATION.fast, ease: EASE_STANDARD }}
          onClick={onClose}
        >
          <motion.section
            ref={dialogRef}
            className="modal-card modal-card-compact modal-card-share"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-link-title"
            tabIndex={-1}
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.99 }}
            transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <h2 id="share-link-title">{pick(language, "Recomienda un libro", "Share a link", "Comparte unha ligazón")}</h2>
                <p>{pick(language, "Añádelo a Wee y se queda en su tema, con contexto y sin duplicados.", "Share it through Wee so it stays in the right topic with context and no duplicates.", "Pásao por Wee e queda no seu tema, con contexto e sen duplicados.")}</p>
              </div>
              <button type="button" className="btn" onClick={onClose}>
                {pick(language, "Cerrar", "Close", "Pechar")}
              </button>
            </header>

            <form className="stack" onSubmit={submit}>
              <label>
                URL
                <input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://..."
                  required
                  disabled={submitting}
                />
              </label>

              {duplicateState.exists ? (
                <p className={duplicateState.sameUser ? "warning" : "hint"}>
                  {duplicateState.sameUser
                    ? pick(
                        language,
                        `Este libro ya está en tu historial. Lo sumaremos al mismo hilo para mantenerlo ordenado. Colaboradores: ${duplicateState.contributors} · envíos: ${duplicateState.totalShares}.`,
                        `This link is already in your history. We'll merge it into the same thread to keep things tidy. Contributors: ${duplicateState.contributors} · shares: ${duplicateState.totalShares}.`,
                        `Esta ligazón xa está no teu historial. Sumarémola ao mesmo fío para mantelo ordenado. Colaboradores: ${duplicateState.contributors} · envíos: ${duplicateState.totalShares}.`
                      )
                    : pick(language, `Ese libro ya existe: va al hilo actual (${duplicateState.contributors} colaboradores, ${duplicateState.totalShares} envíos).`, `This link already exists: we'll merge it into the current thread (${duplicateState.contributors} contributors, ${duplicateState.totalShares} shares).`, `Esa ligazón xa existe: vai ao fío actual (${duplicateState.contributors} colaboradores, ${duplicateState.totalShares} envíos).`)}
                </p>
              ) : null}

              {!duplicateState.exists && url.trim() ? (
                <p className="hint">{pick(language, "Tip rápido: si lo recomiendas aquí primero, el debate del libro queda ordenado en su hilo.", "Quick tip: share it here first and the discussion stays tidy in-thread.", "Consello rápido: se o compartes aquí primeiro, o debate queda ordenado no seu fío.")}</p>
              ) : null}

              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <Icon name="link" />{" "}
                {submitting ? (
                  <>
                    {pick(language, "Añadiendo el libro", "Processing post", "Procesando nova")}
                    <span className="loading-dots" aria-hidden="true" />
                  </>
                ) : (
                  pick(language, "Añadir al club", "Post", "Publicar")
                )}
              </button>
            </form>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
