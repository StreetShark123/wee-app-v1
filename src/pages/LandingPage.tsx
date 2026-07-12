import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";

// Landing de bienvenida (visitante sin cuenta): el registro es ABIERTO — no hace
// falta invitación. Camino claro y de primera clase para CREAR cuenta y club,
// además de entrar o unirse por invitación. Antes `/` caía directo al formulario
// de login, que parecía "solo para invitados".
export const LandingPage = () => {
  const { language } = useI18n();
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "v0.5.0-beta";
  const [claim, setClaim] = useState(0);
  const claims = [
    pick(language, "Tu club, tus libros, todo en orden", "Your club, your books, all in one place", "O teu club, os teus libros, todo en orde"),
    pick(language, "Leéis a la vez, capítulo a capítulo", "Read together, chapter by chapter", "Ledes á vez, capítulo a capítulo"),
    pick(language, "Menos ruido, más contexto para debatir", "Less noise, more context to discuss", "Menos ruído, máis contexto para debater")
  ];

  useEffect(() => {
    const timer = window.setInterval(() => setClaim((c) => (c + 1) % claims.length), 3600);
    return () => window.clearInterval(timer);
  }, [claims.length]);

  const steps: { icon: IconName; text: string }[] = [
    { icon: "user", text: pick(language, "Crea tu cuenta en un momento", "Create your account in a moment", "Crea a túa conta nun momento") },
    { icon: "users", text: pick(language, "Monta tu club de lectura", "Set up your reading club", "Monta o teu club de lectura") },
    { icon: "send", text: pick(language, "Invita a tu gente y a leer", "Invite your people and start reading", "Convida á túa xente e a ler") }
  ];

  return (
    <main className="auth-layout auth-layout-single landing-layout">
      <section className="auth-card auth-card-main auth-card-access landing-card">
        <h1 className="auth-hero-title">
          <span className="auth-hero-brand">Wee</span>
          <span className="auth-hero-claim-wrap">
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={`${language}-${claim}`}
                className="auth-hero-claim"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {claims[claim]}
              </m.span>
            </AnimatePresence>
          </span>
        </h1>

        <p className="landing-lead">
          {pick(language,
            "Un club de lectura para grupos pequeños: proponéis libros, votáis, leéis por capítulos y debatís sin spoilers. Sin anuncios ni rankings.",
            "A reading club for small groups: propose books, vote, read by chapters and discuss without spoilers. No ads, no rankings.",
            "Un club de lectura para grupos pequenos: propoñedes libros, votades, ledes por capítulos e debatides sen spoilers. Sen anuncios nin rankings.")}
        </p>

        <ol className="landing-steps">
          {steps.map((s, i) => (
            <li key={i} className="landing-step">
              <span className="landing-step-icon"><Icon name={s.icon} size={16} /></span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>

        <div className="landing-cta">
          <Link to="/signup" className="btn btn-primary landing-cta-primary">
            <Icon name="spark" size={15} /> {pick(language, "Crear cuenta y club", "Create account & club", "Crear conta e club")}
          </Link>
          <Link to="/login" className="btn">
            {pick(language, "Ya tengo cuenta", "I already have an account", "Xa teño conta")}
          </Link>
        </div>

        <p className="landing-invite hint">
          {pick(language,
            "¿Te han invitado a un club? Abre el enlace de invitación que te pasaron para unirte directamente.",
            "Got invited to a club? Open the invite link you were sent to join directly.",
            "Convidáronte a un club? Abre a ligazón de invitación que che pasaron para unirte directamente.")}
        </p>
      </section>

      <footer className="auth-soft-footer">
        <p>{pick(language, `Wee ${appVersion} · Gracias por testear con nosotros`, `Wee ${appVersion} · Thanks for testing with us`, `Wee ${appVersion} · Grazas por testear connosco`)}</p>
      </footer>
    </main>
  );
};
