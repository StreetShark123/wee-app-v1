import { useState } from "react";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { TopBar } from "../components/TopBar";
import type { User } from "../lib/types";

interface SettingsPageProps {
  activeUser: User;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onDeleteMyData: () => Promise<void>;
  onOpenShareModal?: () => void;
  onLogout: () => void;
}

export const SettingsPage = ({
  activeUser,
  onExport,
  onImport,
  onDeleteMyData,
  onOpenShareModal,
  onLogout
}: SettingsPageProps) => {
  const { language } = useI18n();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenShareModal} onLogout={onLogout} />
      <section className="page-section">
        <h2><Icon name="settings" /> {pick(language, "Ajustes", "Settings", "Axustes")}</h2>
        <p className="section-intro">
          {pick(language, "Tu cuenta y tus datos.", "Your account and your data.", "A túa conta e os teus datos.")}
        </p>

        <article className="settings-card">
          <h3><Icon name="book" /> {pick(language, "Copia de tus datos", "Your data backup", "Copia dos teus datos")}</h3>
          <p className="hint">{pick(language, "Exporta o importa una copia cuando quieras. Tus datos son tuyos.", "Export or import a copy whenever you want. Your data is yours.", "Exporta ou importa unha copia cando queiras. Os teus datos son teus.")}</p>
          <div className="settings-known-topics">
            <button type="button" className="btn" onClick={() => void onExport()}>
              <Icon name="download" /> {pick(language, "Exportar copia", "Export backup", "Exportar copia")}
            </button>
            <label className="btn">
              <Icon name="upload" /> {pick(language, "Importar copia", "Import backup", "Importar copia")}
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void onImport(file);
                }}
              />
            </label>
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
            <li>{pick(language, "Supresión: elimina tu cuenta y tus datos del club.", "Erasure: delete your account and club data.", "Supresión: elimina a túa conta e os teus datos do club.")}</li>
          </ul>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const okDelete = window.confirm(
                pick(
                  language,
                  "Esto eliminará tu cuenta y tus datos asociados en el club. ¿Continuar?",
                  "This will delete your account and your related club data. Continue?",
                  "Isto eliminará a túa conta e os teus datos asociados no club. Continuar?"
                )
              );
              if (!okDelete) return;
              try {
                await onDeleteMyData();
              } catch {
                setMessage(pick(language, "No se pudo eliminar. Inténtalo otra vez.", "Couldn't delete. Please try again.", "Non se puido eliminar. Inténtao outra vez."));
              }
            }}
          >
            <Icon name="trash" /> {pick(language, "Eliminar mis datos", "Delete my data", "Eliminar os meus datos")}
          </button>
        </article>

        {message ? <p className="hint">{message}</p> : null}
      </section>
    </main>
  );
};
