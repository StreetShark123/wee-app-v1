import { useState } from "react";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { TopBar } from "../components/TopBar";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "../lib/usageAnalytics";
import type { User } from "../lib/types";

interface SettingsPageProps {
  activeUser: User;
  onExport: () => Promise<void>;
  onOpenShareModal?: () => void;
  onLogout: () => void;
}

export const SettingsPage = ({
  activeUser,
  onExport,
  onOpenShareModal,
  onLogout
}: SettingsPageProps) => {
  const { language } = useI18n();
  const [message, setMessage] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState(isAnalyticsOptedOut());

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenShareModal} onLogout={onLogout} />
      <section className="page-section">
        <h2><Icon name="settings" /> {pick(language, "Ajustes", "Settings", "Axustes")}</h2>
        <p className="section-intro">
          {pick(language, "Tu cuenta y tus datos.", "Your account and your data.", "A túa conta e os teus datos.")}
        </p>

        <div className="settings-grid settings-grid-cards">
        <article className="settings-card">
          <h3><Icon name="eye" /> {pick(language, "Cómo usamos tus datos", "How we use your data", "Como usamos os teus datos")}</h3>
          <p className="hint">
            {pick(
              language,
              "Sin trucos: esto es todo lo que pasa con tus datos, lo veas como admin o como miembro.",
              "No tricks: this is everything that happens with your data, whether you're an admin or a member.",
              "Sen trucos: isto é todo o que pasa cos teus datos, sexas admin ou membro."
            )}
          </p>
          <ul className="rules-list">
            <li>{pick(language, "Guardamos lo justo para que el club funcione: tu alias y foto, a qué clubs perteneces, los libros, comentarios, tu avance por capítulos y tus valoraciones.", "We store only what the club needs: your alias and photo, which clubs you're in, books, comments, your chapter progress and your ratings.", "Gardamos o xusto: o teu alias e foto, a que clubs pertences, os libros, comentarios, o teu avance por capítulos e as túas valoracións.")}</li>
            <li>{pick(language, "Lo que escribes en un club lo ve tu club. Tu actividad de lectura aparece en tu perfil público, visible para los miembros.", "What you write in a club is seen by your club. Your reading activity shows on your public profile, visible to members.", "O que escribes nun club veno o teu club. A túa actividade de lectura aparece no teu perfil público.")}</li>
            <li>{pick(language, "Se guarda en Supabase. No vendemos ni compartimos tus datos, no hay anuncios ni perfilado, y no hay cobros.", "It's stored in Supabase. We don't sell or share your data, there are no ads or profiling, and nothing is charged.", "Gárdase en Supabase. Non vendemos nin compartimos os teus datos, sen anuncios nin perfilado, e sen cobros.")}</li>
            <li>{pick(language, "Medición de uso: enviamos vistas de página anónimas (sin tu identidad ni lo que escribes) solo para saber qué pantallas se usan. Puedes desactivarlo aquí abajo.", "Usage measurement: we send anonymous page views (no identity, no content) just to know which screens get used. You can turn it off below.", "Medición de uso: enviamos vistas de páxina anónimas só para saber que pantallas se usan. Podes desactivalo aquí.")}</li>
          </ul>
          <button
            type="button"
            className={`btn${optedOut ? " btn-primary" : ""}`}
            onClick={() => {
              const next = !optedOut;
              setAnalyticsOptOut(next);
              setOptedOut(next);
              setMessage(
                next
                  ? pick(language, "Medición de uso desactivada (se aplica al recargar).", "Usage measurement off (applies on reload).", "Medición de uso desactivada (aplícase ao recargar).")
                  : pick(language, "Medición de uso activada (se aplica al recargar).", "Usage measurement on (applies on reload).", "Medición de uso activada (aplícase ao recargar).")
              );
            }}
          >
            <Icon name={optedOut ? "eyeOff" : "eye"} /> {optedOut
              ? pick(language, "Activar medición de uso anónima", "Turn anonymous usage measurement on", "Activar medición anónima")
              : pick(language, "Desactivar medición de uso", "Turn usage measurement off", "Desactivar medición de uso")}
          </button>
        </article>

        <article className="settings-card">
          <h3><Icon name="book" /> {pick(language, "Copia de tus datos", "Your data backup", "Copia dos teus datos")}</h3>
          <p className="hint">{pick(language, "Descarga una copia de tus datos cuando quieras. Son tuyos.", "Download a copy of your data whenever you want. It's yours.", "Descarga unha copia dos teus datos cando queiras. Son teus.")}</p>
          <div className="settings-known-topics">
            <button type="button" className="btn" onClick={() => void onExport()}>
              <Icon name="download" /> {pick(language, "Exportar copia", "Export backup", "Exportar copia")}
            </button>
          </div>
        </article>

        <article className="settings-card">
          <h3><Icon name="shield" /> {pick(language, "Privacidad y datos", "Privacy & data", "Privacidade e datos")}</h3>
          <p className="hint">
            {pick(
              language,
              "Wee guarda perfiles, libros y votos para que todo el club comparta el mismo espacio.",
              "Wee stores profiles, books and votes so the whole club shares the same space.",
              "Wee garda perfís, libros e votos para que todo o club comparta o mesmo espazo."
            )}
          </p>
          <ul className="rules-list">
            <li>{pick(language, "Acceso/portabilidad: exporta tu copia JSON.", "Access/portability: export your JSON copy.", "Acceso/portabilidade: exporta a túa copia JSON.")}</li>
            <li>{pick(language, "Rectificación: edita tu alias y tu foto en tu perfil.", "Rectification: edit your alias and photo on your profile.", "Rectificación: edita o teu alias e foto no teu perfil.")}</li>
            <li>{pick(language, "Baja: puedes salir de cualquier club desde sus ajustes.", "Leave: you can exit any club from its settings.", "Baixa: podes saír de calquera club desde os seus axustes.")}</li>
          </ul>
        </article>
        </div>

        {message ? <p className="hint">{message}</p> : null}
      </section>
    </main>
  );
};
