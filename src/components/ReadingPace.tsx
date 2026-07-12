import { useState } from "react";
import { pick, useI18n } from "../lib/i18n";
import { Icon } from "./Icon";

interface ReadingPaceProps {
  targetChapter: number;
  totalChapters: number;
  membersDone: number[]; // chaptersDone de cada lector
  myChaptersDone: number;
  canManage: boolean;
  onRemind: () => Promise<{ reminded: number }>;
}

// "Ritmo": la meta de capítulos + dónde va el club + tu estado, en UNA línea
// (lead · barra · nota). En la recta final (meta = último capítulo y ya terminó
// la mayoría) muestra "Finalizado · quedan N" con la barra llena, en vez de
// "va por el cap X".
export const ReadingPace = ({ targetChapter, totalChapters, membersDone, myChaptersDone, canManage, onRemind }: ReadingPaceProps) => {
  const { language } = useI18n();
  const [reminded, setReminded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const readers = membersDone.length;
  const clubAvg = readers > 0 ? Math.round(membersDone.reduce((a, b) => a + b, 0) / readers) : 0;
  const finishedCount = totalChapters > 0 ? membersDone.filter((d) => d >= totalChapters).length : 0;
  const remaining = readers - finishedCount;
  // Recta final: la meta es el final del libro y ya lo terminó la mitad o más.
  const clubDone = totalChapters > 0 && targetChapter >= totalChapters && finishedCount >= 1 && finishedCount >= remaining;
  const behind = membersDone.filter((d) => d < targetChapter).length;
  const myDelta = myChaptersDone - targetChapter;
  const pct = clubDone ? 100 : totalChapters > 0 ? Math.min(100, Math.round((clubAvg / totalChapters) * 100)) : 0;
  const goalPct = totalChapters > 0 ? Math.min(100, Math.round((targetChapter / totalChapters) * 100)) : 0;
  const stragglers = clubDone ? remaining : behind;

  const remind = async () => {
    setBusy(true);
    try {
      const { reminded: n } = await onRemind();
      setReminded(n);
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`reading-pace${clubDone ? " is-done" : ""}`}>
      <div className="reading-pace-row">
        <span className="reading-pace-lead">
          {clubDone
            ? pick(language, "Finalizado", "Finished", "Rematado")
            : pick(language, `Cap. ${clubAvg}`, `Ch. ${clubAvg}`, `Cap. ${clubAvg}`)}
        </span>
        <span className="reading-pace-bar" aria-hidden="true">
          <span className="reading-pace-fill" style={{ width: `${pct}%` }} />
          {!clubDone && targetChapter && totalChapters ? (
            <span className="reading-pace-goal" style={{ left: `${goalPct}%` }} />
          ) : null}
        </span>
        <span className="reading-pace-note">
          {clubDone ? (
            remaining > 0 ? (
              <span className="reading-pace-behind">{pick(language, `quedan ${remaining}`, `${remaining} to go`, `quedan ${remaining}`)}</span>
            ) : (
              <span className="reading-pace-ok">{pick(language, "¡todos!", "everyone!", "todos!")}</span>
            )
          ) : (
            <span className={myDelta >= 0 ? "reading-pace-ok" : "reading-pace-behind"}>
              {myDelta >= 0
                ? pick(language, "vas al día", "on track", "vas ao día")
                : pick(language, `vas a −${-myDelta}`, `−${-myDelta}`, `vas a −${-myDelta}`)}
            </span>
          )}
        </span>
      </div>
      {canManage && stragglers > 0 ? (
        reminded !== null ? (
          <span className="hint">{pick(language, `Aviso enviado a ${reminded}`, `Reminder sent to ${reminded}`, `Aviso enviado a ${reminded}`)}</span>
        ) : (
          <button type="button" className="btn btn-tiny reading-pace-remind" disabled={busy} onClick={() => void remind()}>
            <Icon name="bell" size={12} /> {clubDone
              ? pick(language, `Recordar a los ${stragglers} que faltan`, `Nudge the ${stragglers} left`, `Lembrar aos ${stragglers} que faltan`)
              : pick(language, `Recordar a los ${stragglers} rezagados`, `Nudge the ${stragglers} behind`, `Lembrar aos ${stragglers} atrasados`)}
          </button>
        )
      ) : null}
    </div>
  );
};
