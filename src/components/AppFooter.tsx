import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { pick, useI18n } from "../lib/i18n";
import { EASE_STANDARD, MOTION_DURATION } from "../lib/motion";
import { Icon } from "./Icon";

const ALPHA_VERSION = "v0.1.1-alpha";
const ALPHA_UPDATED_AT = "2026-03-04";

export const AppFooter = () => {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  return (
    <>
      <footer className="app-footer">
        <section className="footer-bar">
          <div className="footer-copy">
            <p>{pick(language, "Wee · comparte lo que lees y debatidlo mejor en el club", "Wee · share it here first and decide better as a group", "Wee · pásao por aquí primeiro e decidides mellor en grupo")}</p>
            <p className="footer-meta">
              {pick(
                language,
                `Estado: Alpha · Versión ${ALPHA_VERSION} · Última actualización ${ALPHA_UPDATED_AT}`,
                `Status: Alpha · Version ${ALPHA_VERSION} · Last update ${ALPHA_UPDATED_AT}`,
                `Estado: Alpha · Versión ${ALPHA_VERSION} · Última actualización ${ALPHA_UPDATED_AT}`
              )}
            </p>
          </div>
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            <Icon name="book" size={14} /> {pick(language, "Sobre Wee", "About Wee", "Sobre Wee")}
          </button>
        </section>
      </footer>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION_DURATION.fast, ease: EASE_STANDARD }}
            onClick={() => setOpen(false)}
          >
            <motion.section
              ref={dialogRef}
              className="modal-card modal-card-compact about-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="about-wee-title"
              tabIndex={-1}
              initial={{ opacity: 0, y: 20, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.99 }}
              transition={{ duration: MOTION_DURATION.base, ease: EASE_STANDARD }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="modal-head">
                <div>
                  <h2 id="about-wee-title">{pick(language, "Sobre Wee", "About Wee", "Sobre Wee")}</h2>
                  <p>{pick(language, "Wee está pensada para clubs de lectura pequeños: libros en común, hilos por tema y señal clara de Aura.", "Wee is made for small groups: shared interests, topic threads and clear Aura signals.", "Wee está pensada para grupos pequenos: intereses en común, fíos por tema e sinal clara de Aura.")}</p>
                </div>
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  {pick(language, "Cerrar", "Close", "Pechar")}
                </button>
              </header>

              <div className="about-grid">
                <article className="about-card">
                  <h3><Icon name="users" /> {pick(language, "Qué es Wee", "What Wee is", "Que é Wee")}</h3>
                  <p>
                    {pick(language, "Somos gente que lee y quería un sitio cálido para compartir libros y debatirlos en pequeño. Wee es eso: un club de lectura para grupos reducidos, con contexto y criterio compartido. Aquí los libros no se pierden: quedan agrupados por tema y listos para seguir el hilo del debate.", "We are people who share links every day and wanted a clearer way to organize small-group conversations. Wee is built for that: micro-communities, context, and shared judgment. pom Ave Gabe. Links do not get lost here: they stay grouped by topic and ready to follow in-thread.", "Somos xente que comparte ligazóns a diario e quería unha forma máis clara de ordenar conversas en pequeno. Wee nace para iso: microcomunidades, contexto e criterio compartido. pom Ave Gabe. Aquí as ligazóns non se perden: quedan agrupadas por tema e listas para seguir o fío.")}
                  </p>
                </article>

                <article className="about-card">
                  <h3><Icon name="target" /> {pick(language, "Cómo funciona", "How it works", "Como funciona")}</h3>
                  <p>
                    {pick(language, "Recomiendas un libro o una lectura, Wee lo coloca por tema y subtema, evita duplicados y suma comentarios con Aura. Resultado: hilos claros y contexto siempre a mano.", "You share a link, Wee places it by topic and subtopic, avoids duplicates and adds Aura comments. Result: clear threads and context always in reach.", "Compartes unha ligazón, Wee colócaa por tema e subtema, evita duplicados e suma comentarios con Aura. Resultado: fíos claros e contexto sempre a man.")}
                  </p>
                </article>

                <article className="about-card">
                  <h3><Icon name="heart" /> {pick(language, "Cómo va Aura", "How Aura works", "Como vai Aura")}</h3>
                  <p>
                    {pick(language, "Aura usa reglas claras: señales de fuente, contexto, novedad y valoración del club. Así sube lo que merece la pena leer y baja el ruido.", "Aura uses clear rules: source signals, context, recency and group ratings. Useful content goes up, noise goes down.", "Aura usa regras claras: sinais de fonte, contexto, actualidade e valoración do grupo. Así sobe o útil e baixa o ruído.")}
                  </p>
                </article>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};
