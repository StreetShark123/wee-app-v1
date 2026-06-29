import { type FormEvent, useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";

interface AuthPageProps {
  mode: "login" | "signup";
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, email?: string) => Promise<void>;
}

export const AuthPage = ({ mode, onLogin, onRegister }: AuthPageProps) => {
  const { language } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [claimIndex, setClaimIndex] = useState(0);
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "v0.4.0-alpha";
  const lastUpdated = (import.meta.env.VITE_LAST_UPDATED as string | undefined) ?? "27 jun 2026";
  const heroClaims = [
    pick(language, "Tu club, tus libros, todo en orden", "Your club, your books, all in one place", "O teu club, os teus libros, todo en orde"),
    pick(language, "Comparte lo que lees y el hilo no se pierde", "Share what you read and the thread stays clear", "Comparte o que les e o fío non se perde"),
    pick(language, "Menos ruido, más contexto para debatir mejor", "Less noise, more context to discuss better", "Menos ruído, máis contexto para debater mellor")
  ];

  useEffect(() => {
    const remembered = localStorage.getItem("wee:last-username");
    if (remembered && mode === "login") setUsername(remembered);
  }, [location.search, mode]);

  useEffect(() => {
    setClaimIndex(0);
    const timer = window.setInterval(() => {
      setClaimIndex((current) => (current + 1) % heroClaims.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [heroClaims.length, language]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password.trim()) {
      setError(pick(language, "Te falta usuario o contraseña.", "You are missing username or password.", "Fáltache usuario ou contrasinal."));
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        await onRegister(username.trim(), password.trim(), email.trim() || undefined);
      } else {
        await onLogin(username.trim(), password.trim());
      }
      localStorage.setItem("wee:last-username", username.trim());
      const invite = new URLSearchParams(location.search).get("invite");
      const code = new URLSearchParams(location.search).get("code");
      navigate(invite ? `/invite/${encodeURIComponent(invite)}` : code ? `/join?code=${encodeURIComponent(code)}` : `/communities${location.search}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : pick(language, "Ups, no pudimos entrar ahora mismo.", "Oops, we couldn't sign you in right now.", "Ups, non puidemos entrar agora mesmo."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-layout auth-layout-single">
      <section className="auth-card auth-card-main auth-card-access">
        <h1 className="auth-hero-title">
          <span className="auth-hero-brand">Wee</span>
          <span className="auth-hero-claim-wrap">
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={`${language}-${claimIndex}`}
                className="auth-hero-claim"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                {heroClaims[claimIndex]}
              </m.span>
            </AnimatePresence>
          </span>
        </h1>
        <p className="hint">{pick(language, "Una sola cuenta para Wee. Entras, eliges tu club de lectura y ya estás con tu gente.", "One account for all Wee. Log in, pick your community, and you are in with your people.", "Unha soa conta para Wee. Entras, escolles comunidade e xa estás coa túa xente.")}</p>

        <form className="stack" onSubmit={submit}>
          <label className="form-field">
            {pick(language, "Nombre de usuario", "Username", "Nome de usuario")}
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder={pick(language, "Ej: paco_wee", "Ex: paco_wee", "Ex: paco_wee")}
              />
            </label>
          {mode === "signup" ? (
            <label className="form-field">
              Email ({pick(language, "opcional", "optional", "opcional")})
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>
          ) : null}
          <label className="form-field">
            {pick(language, "Contraseña", "Password", "Contrasinal")}
            <div className="alias-row">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={pick(language, "Mínimo 6 caracteres", "At least 6 characters", "Mínimo 6 caracteres")}
              />
              <button type="button" className="btn dice-btn" onClick={() => setShowPassword((prev) => !prev)} title={pick(language, "Mostrar u ocultar contraseña", "Show or hide password", "Mostrar ou ocultar contrasinal")}>
                <Icon name={showPassword ? "eyeOff" : "eye"} size={14} />
              </button>
            </div>
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={loading}>
            <Icon name="check" /> {loading
              ? (
                <>
                  {pick(language, "Entrando", "Signing in", "Entrando")}
                  <span className="loading-dots" aria-hidden="true" />
                </>
              )
              : mode === "login"
                ? pick(language, "Entrar", "Log in", "Entrar")
                : pick(language, "Crear cuenta", "Create account", "Crear conta")}
          </button>
          <p className="auth-next-step">
            {pick(
              language,
              "Siguiente paso: eliges tu club de lectura y entras directo a las lecturas.",
              "Next step: pick your community and go straight to feed.",
              "Seguinte paso: escolles comunidade e entras directo no feed."
            )}
          </p>
        </form>

        <p className="auth-switch-inline">
          {mode === "login"
            ? pick(language, "¿Primera vez por aquí?", "First time here?", "Primeira vez por aquí?")
            : pick(language, "¿Ya tienes cuenta?", "Already got an account?", "Xa tes conta?")}{" "}
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => navigate(mode === "login" ? `/signup${location.search}` : `/login${location.search}`)}
          >
            {mode === "login"
              ? pick(language, "Crear cuenta", "Create account", "Crear conta")
              : pick(language, "Entrar", "Log in", "Entrar")}
          </button>
        </p>
      </section>

      <footer className="auth-soft-footer">
        <p>
          {pick(
            language,
            `Wee ${appVersion} · Última actualización: ${lastUpdated} · Gracias por estar aquí y testear con nosotros`,
            `Wee ${appVersion} · Last update: ${lastUpdated} · Thanks for being here and testing with us`,
            `Wee ${appVersion} · Última actualización: ${lastUpdated} · Grazas por estar aquí e testear connosco`
          )}
        </p>
      </footer>
    </main>
  );
};
