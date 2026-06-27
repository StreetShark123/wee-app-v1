import type { PropsWithChildren } from "react";
import { m } from "framer-motion";
import { EASE_STANDARD, MOTION_DURATION } from "../lib/motion";

export const PageTransition = ({ children }: PropsWithChildren) => (
  <m.div
    initial={{ opacity: 0.96, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0.98, y: -4 }}
    transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
    style={{ willChange: "transform, opacity" }}
  >
    {children}
  </m.div>
);
