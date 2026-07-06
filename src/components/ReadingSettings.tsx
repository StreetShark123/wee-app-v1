import { Icon } from "./Icon";
import { pick, useI18n } from "../lib/i18n";
import { setReadingA11y, TEXT_SCALES, useReadingA11y } from "../lib/readingA11y";

// Panel "Accesibilidad de lectura" (vive en MePage). Preferencias de vista
// por-dispositivo: tamaño de texto, interlineado, tipografía legible y reducir
// movimiento. Autónomo: lee/escribe su propio estado (localStorage) y se aplica
// en vivo sobre <html>. Ver src/lib/readingA11y.ts.
export const ReadingSettings = () => {
  const { language } = useI18n();
  const s = useReadingA11y();

  const scaleIndex = TEXT_SCALES.indexOf(s.textScale as typeof TEXT_SCALES[number]);
  const idx = scaleIndex < 0 ? 1 : scaleIndex;
  const atMin = idx <= 0;
  const atMax = idx >= TEXT_SCALES.length - 1;
  const stepSize = (dir: -1 | 1) => {
    const next = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, idx + dir))];
    if (next !== s.textScale) setReadingA11y({ textScale: next });
  };

  return (
    <section className="page-section a11y-settings">
      <div className="section-head"><h3><Icon name="eye" /> {pick(language, "Accesibilidad de lectura", "Reading accessibility", "Accesibilidade de lectura")}</h3></div>
      <p className="hint">{pick(language, "Ajusta cómo se ve la app. Se guarda en este dispositivo.", "Tune how the app looks. Saved on this device.", "Axusta como se ve a app. Gárdase neste dispositivo.")}</p>

      {/* Tamaño de texto */}
      <div className="a11y-row">
        <span className="a11y-row-label">{pick(language, "Tamaño de texto", "Text size", "Tamaño de texto")}</span>
        <div className="a11y-stepper" role="group" aria-label={pick(language, "Tamaño de texto", "Text size", "Tamaño de texto")}>
          <button type="button" className="btn a11y-step" disabled={atMin} onClick={() => stepSize(-1)} aria-label={pick(language, "Reducir texto", "Smaller text", "Reducir texto")}>
            <span className="a11y-step-a a11y-step-a-sm">A</span>
          </button>
          <span className="a11y-step-value" aria-live="polite">{Math.round(s.textScale * 100)}%</span>
          <button type="button" className="btn a11y-step" disabled={atMax} onClick={() => stepSize(1)} aria-label={pick(language, "Aumentar texto", "Bigger text", "Aumentar texto")}>
            <span className="a11y-step-a a11y-step-a-lg">A</span>
          </button>
        </div>
      </div>
      <p className="a11y-preview">{pick(language, "Así se lee un capítulo del club.", "This is how a club chapter reads.", "Así se le un capítulo do club.")}</p>

      {/* Interlineado */}
      <div className="a11y-row">
        <span className="a11y-row-label">{pick(language, "Interlineado", "Line spacing", "Interliñado")}</span>
        <div className="a11y-segment" role="group" aria-label={pick(language, "Interlineado", "Line spacing", "Interliñado")}>
          <button type="button" className={`btn a11y-seg${s.lineSpacing === "normal" ? " is-on" : ""}`} aria-pressed={s.lineSpacing === "normal"} onClick={() => setReadingA11y({ lineSpacing: "normal" })}>
            {pick(language, "Normal", "Normal", "Normal")}
          </button>
          <button type="button" className={`btn a11y-seg${s.lineSpacing === "relaxed" ? " is-on" : ""}`} aria-pressed={s.lineSpacing === "relaxed"} onClick={() => setReadingA11y({ lineSpacing: "relaxed" })}>
            {pick(language, "Amplio", "Relaxed", "Amplo")}
          </button>
        </div>
      </div>

      {/* Tipografía legible */}
      <button type="button" className={`a11y-toggle${s.legibleFont ? " is-on" : ""}`} aria-pressed={s.legibleFont} onClick={() => setReadingA11y({ legibleFont: !s.legibleFont })}>
        <span className="a11y-toggle-text">
          <strong>{pick(language, "Tipografía de alta legibilidad", "High-legibility font", "Tipografía de alta lexibilidade")}</strong>
          <span className="hint">{pick(language, "Cambia la letra por una sans más clara.", "Swaps to a clearer sans-serif.", "Cambia a letra por unha sans máis clara.")}</span>
        </span>
        <span className="a11y-switch" aria-hidden="true" />
      </button>

      {/* Reducir movimiento */}
      <button type="button" className={`a11y-toggle${s.reduceMotion ? " is-on" : ""}`} aria-pressed={s.reduceMotion} onClick={() => setReadingA11y({ reduceMotion: !s.reduceMotion })}>
        <span className="a11y-toggle-text">
          <strong>{pick(language, "Reducir movimiento", "Reduce motion", "Reducir movemento")}</strong>
          <span className="hint">{pick(language, "Desactiva las animaciones de la interfaz.", "Turns off interface animations.", "Desactiva as animacións da interface.")}</span>
        </span>
        <span className="a11y-switch" aria-hidden="true" />
      </button>
    </section>
  );
};
