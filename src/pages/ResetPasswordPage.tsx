import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { resetPasswordWithToken } from "../lib/communityApi";

// Página pública de restablecimiento: se abre desde el enlace que el admin
// generó (/#/reset?token=…). El usuario fija su nueva contraseña sin sesión.
export const ResetPasswordPage = () => {
  const { language } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(pick(language, "La contraseña debe tener al menos 8 caracteres.", "Password must be at least 8 characters.", "O contrasinal debe ter polo menos 8 caracteres."));
      return;
    }
    if (password !== confirm) {
      setError(pick(language, "Las contraseñas no coinciden.", "Passwords don't match.", "Os contrasinais non coinciden."));
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithToken(token, password);
      setDone(true);
    } catch (err) {
      setError((err as Error).message || pick(language, "No se pudo cambiar la contraseña. El enlace puede haber caducado.", "Couldn't change the password. The link may have expired.", "Non se puido cambiar o contrasinal. A ligazón puido caducar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout auth-layout-single">
      <section className="auth-card auth-card-main auth-card-access">
        <h1 className="auth-hero-title"><span className="auth-hero-brand">Wee</span></h1>
        {!token ? (
          <>
            <p className="error" role="alert">{pick(language, "Enlace no válido. Pide otro al administrador de tu club.", "Invalid link. Ask your club admin for a new one.", "Ligazón non válida. Pide outra ao administrador do teu club.")}</p>
            <p className="auth-switch-inline"><Link to="/login" className="auth-link-btn">{pick(language, "Ir a iniciar sesión", "Go to log in", "Ir a iniciar sesión")}</Link></p>
          </>
        ) : done ? (
          <>
            <p className="hint"><Icon name="check" size={14} /> {pick(language, "Contraseña actualizada. Ya puedes iniciar sesión con la nueva.", "Password updated. You can now log in with the new one.", "Contrasinal actualizado. Xa podes iniciar sesión coa nova.")}</p>
            <p className="auth-switch-inline"><Link to="/login" className="btn btn-primary auth-submit-btn">{pick(language, "Iniciar sesión", "Log in", "Iniciar sesión")}</Link></p>
          </>
        ) : (
          <>
            <p className="hint">{pick(language, "Elige una contraseña nueva para tu cuenta.", "Choose a new password for your account.", "Escolle un contrasinal novo para a túa conta.")}</p>
            <form className="stack" onSubmit={submit}>
              <label className="form-field">
                {pick(language, "Nueva contraseña", "New password", "Novo contrasinal")}
                <div className="alias-row">
                  <input type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} />
                  <button type="button" className="btn dice-btn" onClick={() => setShow((prev) => !prev)} title={pick(language, "Mostrar u ocultar contraseña", "Show or hide password", "Mostrar ou ocultar contrasinal")}>
                    <Icon name={show ? "eyeOff" : "eye"} size={14} />
                  </button>
                </div>
              </label>
              <label className="form-field">
                {pick(language, "Repite la contraseña", "Repeat the password", "Repite o contrasinal")}
                <input type={show ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} />
              </label>
              {error ? <p className="error" role="alert">{error}</p> : null}
              <button type="submit" className="btn btn-primary auth-submit-btn" disabled={busy} aria-busy={busy}>
                {pick(language, "Guardar contraseña", "Save password", "Gardar contrasinal")}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
};
