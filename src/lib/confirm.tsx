import { AnimatePresence, m } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { EASE_STANDARD, MOTION_DURATION } from "./motion";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);
export const useConfirm = (): ConfirmFn => useContext(ConfirmContext);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setState(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [state, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state ? (
          <m.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION_DURATION.fast, ease: EASE_STANDARD }}
            onClick={() => close(false)}
          >
            <m.section
              className="modal-card modal-card-compact confirm-modal"
              role="alertdialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2>{state.title}</h2>
              {state.message ? <p className="hint">{state.message}</p> : null}
              <div className="confirm-actions">
                <button type="button" className="btn" onClick={() => close(false)}>
                  {state.cancelLabel ?? "Cancelar"}
                </button>
                <button
                  type="button"
                  className={`btn ${state.danger ? "btn-danger" : "btn-primary"}`}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {state.confirmLabel ?? "Confirmar"}
                </button>
              </div>
            </m.section>
          </m.div>
        ) : null}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
};
