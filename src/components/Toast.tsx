import { AnimatePresence, m } from "framer-motion";
import { EASE_STANDARD, MOTION_DURATION } from "../lib/motion";

interface ToastProps {
  message: string | null;
}

export const Toast = ({ message }: ToastProps) => (
  <AnimatePresence>
    {message ? (
      <m.div
        className="toast"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: MOTION_DURATION.fast, ease: EASE_STANDARD }}
      >
        {message}
      </m.div>
    ) : null}
  </AnimatePresence>
);
