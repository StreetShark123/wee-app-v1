import { pick } from "./i18n";
import type { AppLanguage } from "./types";

// "hace X" relativo y corto, para notas y comentarios.
export const timeAgo = (ms: number, language: AppLanguage): string => {
  const diff = Date.now() - ms;
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (diff < MIN) return pick(language, "ahora", "now", "agora");
  if (diff < HOUR) {
    const n = Math.floor(diff / MIN);
    return pick(language, `hace ${n} min`, `${n}m ago`, `hai ${n} min`);
  }
  if (diff < DAY) {
    const n = Math.floor(diff / HOUR);
    return pick(language, `hace ${n} h`, `${n}h ago`, `hai ${n} h`);
  }
  const d = Math.floor(diff / DAY);
  if (d < 7) return pick(language, `hace ${d} d`, `${d}d ago`, `hai ${d} d`);
  const w = Math.floor(d / 7);
  if (w < 5) return pick(language, `hace ${w} sem`, `${w}w ago`, `hai ${w} sem`);
  const mo = Math.max(1, Math.floor(d / 30));
  return pick(language, `hace ${mo} mes`, `${mo}mo ago`, `hai ${mo} mes`);
};
