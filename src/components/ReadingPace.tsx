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

// "Ritmo": la meta de capítulos + dónde va el club de media + tu estado, para
// sincronizar al grupo. Aprovecha la cadencia (target_chapter) ya existente.
export const ReadingPace = ({ targetChapter, totalChapters, membersDone, myChaptersDone, canManage, onRemind }: ReadingPaceProps) => {
  const { language } = useI18n();
  const [reminded, setReminded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const readers = membersDone.length;
  const clubAvg = readers > 0 ? Math.round(membersDone.reduce((a, b) => a + b, 0) / readers) : 0;
  const behind = membersDone.filter((d) => d < targetChapter).length;
  const myDelta = myChaptersDone - targetChapter;
  const pct = totalChapters > 0 ? Math.min(100, Math.round((clubAvg / totalChapters) * 100)) : 0;

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
    <div className="reading-pace">
      <div className="reading-pace-bar" aria-hidden="true">
        <span className="reading-pace-fill" style={{ width: `${pct}%` }} />
        {targetChapter && totalChapters ? (
          <span className="reading-pace-goal" style={{ left: `${Math.min(100, Math.round((targetChapter / totalChapters) * 100))}%` }} />
        ) : null}
      </div>
      <p className="reading-pace-label">
        {pick(language, `El club va por el cap. ${clubAvg} de media`, `The club averages chapter ${clubAvg}`, `O club vai polo cap. ${clubAvg} de media`)}
        {" · "}
        <span className={myDelta >= 0 ? "reading-pace-ok" : "reading-pace-behind"}>
          {myDelta >= 0
            ? pick(language, "vas al día", "you're on track", "vas ao día")
            : pick(language, `vas a −${-myDelta}`, `you're ${-myDelta} behind`, `vas a −${-myDelta}`)}
        </span>
      </p>
      {canManage && behind > 0 ? (
        reminded !== null ? (
          <span className="hint">{pick(language, `Aviso enviado a ${reminded}`, `Reminder sent to ${reminded}`, `Aviso enviado a ${reminded}`)}</span>
        ) : (
          <button type="button" className="btn btn-tiny" disabled={busy} onClick={() => void remind()}>
            <Icon name="bell" size={12} /> {pick(language, `Recordar a los ${behind} rezagados`, `Nudge the ${behind} behind`, `Lembrar aos ${behind} atrasados`)}
          </button>
        )
      ) : null}
    </div>
  );
};
