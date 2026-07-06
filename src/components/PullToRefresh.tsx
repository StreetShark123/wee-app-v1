import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Tirar-para-refrescar (gesto tipo app nativa): al arrastrar hacia abajo con la
// página arriba del todo, aparece el glifo de puntuación (mismo ciclo que el
// loader de la app) y al soltar pasado el umbral refresca. Escucha el gesto a
// nivel de ventana (el scroll de wee es del documento) y pinta el indicador en
// un portal a <body> para escapar del transform de PageTransition.

const THRESHOLD = 72;   // px de arrastre (ya con resistencia) para disparar
const MAX_PULL = 110;   // tope visual del arrastre
const RESISTANCE = 0.5; // el dedo recorre el doble que el indicador

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
}

export const PullToRefresh = ({ onRefresh }: PullToRefreshProps) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const active = useRef(false);      // hay un gesto de pull en curso
  const distRef = useRef(0);         // distancia actual (para leerla en touchend)
  const refreshingRef = useRef(false);

  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    // Solo se puede empezar a tirar si estamos arriba del todo y sin un modal
    // abierto (el modal tiene su propio scroll y no debe disparar refresco).
    const canStart = () => window.scrollY <= 0 && !document.querySelector(".modal-overlay");

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1 || !canStart()) {
        active.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { distRef.current = 0; setPull(0); return; }
      // Si el scroll ya no está arriba (rebote/scroll normal), cancela el gesto.
      if (window.scrollY > 0) { active.current = false; distRef.current = 0; setPull(0); return; }
      const dist = Math.min(MAX_PULL, dy * RESISTANCE);
      distRef.current = dist;
      setPull(dist);
      setDragging(true);
      // Frena el scroll/rebote nativo mientras tiramos (listener no-pasivo).
      if (dist > 2 && e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      setDragging(false);
      if (distRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        void onRefresh().finally(() => {
          setRefreshing(false);
          distRef.current = 0;
          setPull(0);
        });
      } else {
        distRef.current = 0;
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh]);

  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);

  return createPortal(
    <div
      className={`ptr${dragging ? " is-dragging" : ""}${refreshing ? " is-refreshing" : ""}`}
      style={{ transform: `translateY(${pull}px)`, opacity: visible ? 1 : 0 }}
      aria-hidden={!visible}
    >
      <span
        className={`ptr-glyph${refreshing || progress >= 1 ? " is-live" : ""}`}
        style={{ transform: `scale(${0.6 + progress * 0.4})` }}
      />
    </div>,
    document.body
  );
};
