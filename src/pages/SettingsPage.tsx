import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { pick, useI18n } from "../lib/i18n";
import { TopBar } from "../components/TopBar";
import { checkSupabaseConnection, hasSupabaseConfig } from "../lib/backend/supabase";
import type { User, UserPreferences } from "../lib/types";

interface SettingsPageProps {
  activeUser: User;
  preferences: UserPreferences | null;
  knownTopics: string[];
  onSave: (prefs: UserPreferences) => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onDeleteMyData: () => Promise<void>;
  onOpenShareModal?: () => void;
  onLogout: () => void;
}

const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const uniq = (items: string[]): string[] => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

export const SettingsPage = ({
  activeUser,
  preferences,
  knownTopics,
  onSave,
  onExport,
  onImport,
  onDeleteMyData,
  onOpenShareModal,
  onLogout
}: SettingsPageProps) => {
  const { language } = useI18n();
  const [preferredTopics, setPreferredTopics] = useState<string[]>([]);
  const [blockedDomains, setBlockedDomains] = useState<string[]>([]);
  const [blockedKeywords, setBlockedKeywords] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [noiseMode, setNoiseMode] = useState<"open" | "balanced" | "strict">("balanced");
  const [message, setMessage] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const [checkingBackend, setCheckingBackend] = useState(false);

  useEffect(() => {
    if (!preferences) return;
    setPreferredTopics(preferences.preferredTopics);
    setBlockedDomains(preferences.blockedDomains);
    setBlockedKeywords(preferences.blockedKeywords);
  }, [preferences]);

  const save = async () => {
    try {
      await onSave({
        userId: activeUser.id,
        preferredTopics: uniq(preferredTopics),
        blockedDomains: uniq(blockedDomains),
        blockedKeywords: uniq(blockedKeywords)
      });
      setMessage(pick(language, "Listo, preferencias guardadas.", "Done, preferences saved.", "Listo, preferencias gardadas."));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown_error";
      if (detail === "MISSING_USER_PREFERENCES_TABLE") {
        setMessage(
          pick(
            language,
            "Falta la tabla user_preferences en Supabase. Ejecuta el SQL v2 para poder guardar ajustes.",
            "The user_preferences table is missing in Supabase. Run SQL v2 to save settings.",
            "Falta a táboa user_preferences en Supabase. Executa o SQL v2 para poder gardar axustes."
          )
        );
        return;
      }
      setMessage(
        pick(
          language,
          `No pudimos guardar ajustes: ${detail}`,
          `Couldn't save settings: ${detail}`,
          `Non puidemos gardar axustes: ${detail}`
        )
      );
    }
  };

  const quickDomains = ["x.com", "twitter.com", "tiktok.com", "instagram.com"];
  const quickKeywords = ["rumor", "sin confirmar", "viral", "te va a sorprender"];
  const suggestedTopics = knownTopics.slice(0, 18);

  const togglePreferredTopic = (topic: string) => {
    const current = new Set(preferredTopics);
    if (current.has(topic)) {
      current.delete(topic);
    } else {
      current.add(topic);
    }
    setPreferredTopics(Array.from(current));
  };

  const toggleDomain = (domain: string) => {
    const current = new Set(blockedDomains);
    if (current.has(domain)) {
      current.delete(domain);
    } else {
      current.add(domain);
    }
    setBlockedDomains(Array.from(current));
  };

  const toggleKeyword = (keyword: string) => {
    const current = new Set(blockedKeywords);
    if (current.has(keyword)) {
      current.delete(keyword);
    } else {
      current.add(keyword);
    }
    setBlockedKeywords(Array.from(current));
  };

  const addTopicsFromInput = () => {
    const next = parseCsv(topicInput);
    if (!next.length) return;
    setPreferredTopics((curr) => uniq([...curr, ...next]));
    setTopicInput("");
  };

  const addDomainsFromInput = () => {
    const next = parseCsv(domainInput).map((item) => item.replace(/^https?:\/\//, "").replace(/^www\./, ""));
    if (!next.length) return;
    setBlockedDomains((curr) => uniq([...curr, ...next]));
    setDomainInput("");
  };

  const addKeywordsFromInput = () => {
    const next = parseCsv(keywordInput);
    if (!next.length) return;
    setBlockedKeywords((curr) => uniq([...curr, ...next]));
    setKeywordInput("");
  };

  const applyMode = (mode: "open" | "balanced" | "strict") => {
    setNoiseMode(mode);
    if (mode === "open") {
      setBlockedDomains([]);
      setBlockedKeywords([]);
      return;
    }
    if (mode === "balanced") {
      setBlockedDomains(["tiktok.com"]);
      setBlockedKeywords(["te va a sorprender", "sin confirmar"]);
      return;
    }
    setBlockedDomains(["tiktok.com", "instagram.com", "twitter.com", "x.com"]);
    setBlockedKeywords(["te va a sorprender", "sin confirmar", "rumor", "viral"]);
  };

  return (
    <main>
      <TopBar user={activeUser} onOpenShare={onOpenShareModal} onLogout={onLogout} />
      <section className="page-section">
        <h2><Icon name="settings" /> {pick(language, "Ajustes", "Settings", "Axustes")}</h2>
        <p className="section-intro">
          {pick(language, "Déjalo a tu gusto: qué lecturas quieres ver y cuánto ruido filtrar.", "Tune it your way: what you want to see and how much noise to filter.", "Déixao ao teu gusto: que queres ver e canto ruído filtrar.")}
        </p>

        <div className="settings-grid">
          <article className="settings-card">
            <h3><Icon name="target" /> {pick(language, "Qué ver primero", "What to see first", "Que ver primeiro")}</h3>
            <p className="hint">{pick(language, "Marca temas y te los subimos arriba.", "Pick topics and we'll move them to the top.", "Marca temas e subímolos arriba.")}</p>
            {suggestedTopics.length > 0 ? (
              <div className="settings-known-topics">
                {suggestedTopics.map((topic) => {
                  const active = preferredTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      className={active ? "chip chip-action settings-topic-active" : "chip chip-action"}
                      onClick={() => togglePreferredTopic(topic)}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="hint">{pick(language, "Aún no hay temas detectados. Añade unos libros y aparecerán aquí.", "No topics yet. Share a few posts and they'll show up here.", "Aínda non hai temas detectados. Comparte unhas novas e aparecerán aquí.")}</p>
            )}

            <div className="settings-inline-add">
              <input
                value={topicInput}
                onChange={(event) => setTopicInput(event.target.value)}
                placeholder={pick(language, "Añadir temas (ej: salud, ciencia)", "Add topics (e.g. health, science)", "Engadir temas (ex: saúde, ciencia)")}
              />
              <button type="button" className="btn" onClick={addTopicsFromInput}>
                {pick(language, "Añadir", "Add", "Engadir")}
              </button>
            </div>
          </article>

          <article className="settings-card">
            <h3><Icon name="bolt" /> {pick(language, "Ruido de las lecturas", "Feed noise", "Ruído do feed")}</h3>
            <p className="hint">{pick(language, "Elige un modo rápido y luego lo ajustas fino debajo.", "Pick a quick mode and fine-tune it below.", "Escolle un modo rápido e logo axústalo fino debaixo.")}</p>
            <div className="settings-modes">
              <button
                type="button"
                className={noiseMode === "open" ? "tab active" : "tab"}
                onClick={() => applyMode("open")}
              >
                {pick(language, "Abierto", "Open", "Aberto")}
              </button>
              <button
                type="button"
                className={noiseMode === "balanced" ? "tab active" : "tab"}
                onClick={() => applyMode("balanced")}
              >
                {pick(language, "Equilibrado", "Balanced", "Equilibrado")}
              </button>
              <button
                type="button"
                className={noiseMode === "strict" ? "tab active" : "tab"}
                onClick={() => applyMode("strict")}
              >
                {pick(language, "Estricto", "Strict", "Estrito")}
              </button>
            </div>
            <p className="hint">
              {noiseMode === "open"
                ? pick(language, "Ves casi todo.", "You see almost everything.", "Ves case todo.")
                : noiseMode === "balanced"
                  ? pick(language, "Quita ruido sin pasarse.", "Removes noise without overdoing it.", "Quita ruído sen pasarse.")
                  : pick(language, "Filtro fuerte: solo lo más limpio.", "Strong filter: only the cleanest stuff.", "Filtro forte: só o máis limpo.")}
            </p>
          </article>
        </div>

        <div className="settings-grid">
          <article className="settings-card">
            <h3><Icon name="link" /> {pick(language, "Fuentes que no quieres ver", "Sources you don't want to see", "Fontes que non queres ver")}</h3>
            <div className="settings-known-topics">
              {quickDomains.map((domain) => {
                const active = blockedDomains.includes(domain);
                return (
                  <button
                    key={domain}
                    type="button"
                    className={active ? "chip chip-action settings-topic-active" : "chip chip-action"}
                    onClick={() => toggleDomain(domain)}
                  >
                    {domain}
                  </button>
                );
              })}
            </div>
            <div className="settings-inline-add">
              <input
                value={domainInput}
                onChange={(event) => setDomainInput(event.target.value)}
                placeholder={pick(language, "Añadir dominios (ej: ejemplo.com)", "Add domains (e.g. example.com)", "Engadir dominios (ex: exemplo.com)")}
              />
              <button type="button" className="btn" onClick={addDomainsFromInput}>
                {pick(language, "Añadir", "Add", "Engadir")}
              </button>
            </div>
          </article>

          <article className="settings-card">
            <h3><Icon name="comment" /> {pick(language, "Palabras para filtrar", "Keywords to filter", "Palabras para filtrar")}</h3>
            <div className="settings-known-topics">
              {quickKeywords.map((keyword) => {
                const active = blockedKeywords.includes(keyword);
                return (
                  <button
                    key={keyword}
                    type="button"
                    className={active ? "chip chip-action settings-topic-active" : "chip chip-action"}
                    onClick={() => toggleKeyword(keyword)}
                  >
                    {keyword}
                  </button>
                );
              })}
            </div>
            <div className="settings-inline-add">
              <input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder={pick(language, "Añadir palabras (ej: bulo, rumor)", "Add keywords (e.g. rumor, hoax)", "Engadir palabras (ex: bulo, rumor)")}
              />
              <button type="button" className="btn" onClick={addKeywordsFromInput}>
                {pick(language, "Añadir", "Add", "Engadir")}
              </button>
            </div>
          </article>
        </div>

        <article className="settings-card">
          <h3><Icon name="target" /> {pick(language, "Resumen", "Summary", "Resumo")}</h3>
          <p className="hint">
            {pick(language, "Temas priorizados", "Prioritized topics", "Temas priorizados")}: {preferredTopics.length} · {pick(language, "Fuentes ocultas", "Hidden sources", "Fontes ocultas")}: {blockedDomains.length} · {pick(language, "Palabras filtradas", "Filtered keywords", "Palabras filtradas")}: {blockedKeywords.length}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            <Icon name="check" /> {pick(language, "Guardar ajustes", "Save settings", "Gardar axustes")}
          </button>
        </article>

        <article className="settings-card">
          <h3><Icon name="link" /> {pick(language, "Estado del backend (Supabase)", "Backend status (Supabase)", "Estado do backend (Supabase)")}</h3>
          <p className="hint">
            {hasSupabaseConfig
              ? pick(language, "Configuración detectada. Si quieres, puedes comprobar conexión.", "Configuration detected. You can check the connection.", "Configuración detectada. Se queres, podes comprobar conexión.")
              : pick(language, "Aquí no hay configuración de Supabase todavía.", "No Supabase configuration was found here yet.", "Aquí non hai configuración de Supabase aínda.")}
          </p>
          <button
            type="button"
            className="btn"
            disabled={!hasSupabaseConfig || checkingBackend}
            onClick={async () => {
              setCheckingBackend(true);
              const result = await checkSupabaseConnection();
              setBackendStatus(result.message);
              setCheckingBackend(false);
            }}
          >
            <Icon name="check" /> {pick(language, "Comprobar conexión", "Check connection", "Comprobar conexión")}
          </button>
          {backendStatus ? <p className="hint">{backendStatus}</p> : null}
        </article>

        <article className="settings-card">
          <h3><Icon name="book" /> {pick(language, "Copia de tus datos", "Your data backup", "Copia dos teus datos")}</h3>
          <p className="hint">{pick(language, "Exporta o importa una copia cuando quieras.", "Export or import a copy whenever you want.", "Exporta ou importa unha copia cando queiras.")}</p>
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
              "Wee guarda perfiles, libros y votos en Supabase para que todo el club comparta el mismo espacio.",
              "Wee stores profiles, posts, and votes in Supabase so the whole community shares the same space.",
              "Wee garda perfís, novas e votos en Supabase para que toda a comunidade comparta o mesmo espazo."
            )}
          </p>
          <ul className="rules-list">
            <li>{pick(language, "Acceso/portabilidad: exporta tu copia JSON.", "Access/portability: export your JSON copy.", "Acceso/portabilidade: exporta a túa copia JSON.")}</li>
            <li>{pick(language, "Rectificación: edita alias/foto y tus libros.", "Rectification: edit alias/photo and posts.", "Rectificación: edita alias/foto e publicacións.")}</li>
            <li>{pick(language, "Supresión: elimina tu cuenta y tus datos del club.", "Erasure: delete your account and community data.", "Supresión: elimina a túa conta e os teus datos da comunidade.")}</li>
          </ul>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const okDelete = window.confirm(
                pick(
                  language,
                  "Esto eliminará tu cuenta y tus datos asociados en el club. ¿Continuar?",
                  "This will delete your account and your related community data. Continue?",
                  "Isto eliminará a túa conta e os teus datos asociados na comunidade. Continuar?"
                )
              );
              if (!okDelete) return;
              await onDeleteMyData();
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
