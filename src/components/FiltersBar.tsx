import type { SearchFilters } from "../lib/types";
import { pick, useI18n } from "../lib/i18n";

interface FiltersBarProps {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  availableTopics: string[];
  availableDomains: string[];
}

export const FiltersBar = ({ filters, onChange, availableTopics, availableDomains }: FiltersBarProps) => (
  <FiltersBarInner
    filters={filters}
    onChange={onChange}
    availableTopics={availableTopics}
    availableDomains={availableDomains}
  />
);

const FiltersBarInner = ({ filters, onChange, availableTopics, availableDomains }: FiltersBarProps) => {
  const { language } = useI18n();
  return (
    <section className="filters">
      <input
        type="search"
        placeholder={pick(language, "Buscar por título, autor, tema o fuente", "Search by text, topic or domain", "Buscar por texto, tema ou dominio")}
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
      />

      <select
        value={filters.qualityLabel}
        onChange={(event) => onChange({ ...filters, qualityLabel: event.target.value as SearchFilters["qualityLabel"] })}
      >
        <option value="all">{pick(language, "Todo Aura", "All Aura", "Toda Aura")}</option>
        <option value="high">{pick(language, "Alta", "High", "Alta")}</option>
        <option value="medium">{pick(language, "Media", "Medium", "Media")}</option>
        <option value="low">{pick(language, "Baja", "Low", "Baixa")}</option>
        <option value="clickbait">Clickbait</option>
      </select>

      <select value={filters.topic} onChange={(event) => onChange({ ...filters, topic: event.target.value })}>
        <option value="all">{pick(language, "Todos los temas", "All topics", "Todos os temas")}</option>
        {availableTopics.map((topic) => (
          <option key={topic} value={topic}>
            {topic}
          </option>
        ))}
      </select>

      <select value={filters.domain} onChange={(event) => onChange({ ...filters, domain: event.target.value })}>
        <option value="all">{pick(language, "Todos los dominios", "All domains", "Todos os dominios")}</option>
        {availableDomains.map((domain) => (
          <option key={domain} value={domain}>
            {domain}
          </option>
        ))}
      </select>
    </section>
  );
};
