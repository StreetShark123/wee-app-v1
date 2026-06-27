import { AnimatePresence, m } from "framer-motion";
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
          <m.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION_DURATION.fast, ease: EASE_STANDARD }}
            onClick={() => setOpen(false)}
          >
            <m.section
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
                  <p>{pick(language, "Un club de lectura para grupos pequeños: proponéis libros, votáis, leéis por capítulos y debatís sin spoilers.", "A reading club for small groups: propose books, vote, read by chapters and discuss without spoilers.", "Un club de lectura para grupos pequenos: propoñedes libros, votades, ledes por capítulos e debatides sen spoilers.")}</p>
                </div>
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  {pick(language, "Cerrar", "Close", "Pechar")}
                </button>
              </header>

              <div className="about-grid">
                <article className="about-card">
                  <h3><Icon name="users" /> {pick(language, "Qué es Wee", "What Wee is", "Que é Wee")}</h3>
                  <p>
                    {pick(language, "Somos gente que lee y quería un sitio cálido para leer en grupo y debatir los libros sin prisa. Wee es eso: un club de lectura para grupos reducidos, con ritmo compartido y debate ordenado.", "We're people who read and wanted a warm place to read together and discuss books unhurried. Wee is that: a reading club for small groups, with shared pace and tidy discussion.", "Somos xente que le e quería un sitio cálido para ler en grupo e debater os libros sen présa. Wee é iso: un club de lectura para grupos reducidos, con ritmo compartido.")}
                  </p>
                </article>

                <article className="about-card">
                  <h3><Icon name="target" /> {pick(language, "Cómo funciona", "How it works", "Como funciona")}</h3>
                  <p>
                    {pick(language, "Proponéis libros y el club vota. El aprobado pasa a lectura: seguís los capítulos, dejáis notas y debatís en hilos. Cuando todos terminan, queda en 'leídos'.", "You propose books and the club votes. The approved one starts reading: track chapters, leave notes and discuss in threads. When everyone finishes, it moves to 'read'.", "Propoñedes libros e o club vota. O aprobado pasa a lectura: seguides os capítulos, deixades notas e debatides en fíos. Cando todos rematan, queda en 'lidos'.")}
                  </p>
                </article>

                <article className="about-card">
                  <h3><Icon name="heart" /> {pick(language, "Comunidad, sin ruido", "Community, no noise", "Comunidade, sen ruído")}</h3>
                  <p>
                    {pick(language, "Sin monetización, sin rankings de velocidad ni rachas. Notas anti-spoiler, ritmo sano y debate cuidado. La lectura es un placer compartido, no una competición.", "No monetization, no speed rankings or streaks. Anti-spoiler notes, healthy pace and tidy debate. Reading is a shared pleasure, not a competition.", "Sen monetización, sen rankings de velocidade nin rachas. Notas anti-spoiler, ritmo san e debate coidado.")}
                  </p>
                </article>
              </div>
            </m.section>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};
