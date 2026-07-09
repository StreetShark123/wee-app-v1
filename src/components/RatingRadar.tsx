import type { AxisStat } from "../lib/communityApi";
import type { RatingAxis } from "../lib/ratingAxes";
import type { AppLanguage } from "../lib/types";

// Radar del club (SVG puro, sin librerías). Media del club vs. tu capa. Es el
// "mapa del club sobre el libro" para el debate, no una nota de producto.
interface RatingRadarProps {
  axes: RatingAxis[];
  stats: AxisStat[];
  myAxes: Record<string, number>;
  language: AppLanguage;
}

const SIZE = 240;
const C = SIZE / 2;
const R = 84;

export const RatingRadar = ({ axes, stats, myAxes, language }: RatingRadarProps) => {
  const n = axes.length;
  if (n < 3) return null;
  const statByKey = new Map(stats.map((s) => [s.key, s]));
  const angle = (i: number) => (-90 + (i * 360) / n) * (Math.PI / 180);
  const point = (i: number, value: number) => {
    const rr = (Math.max(0, Math.min(10, value)) / 10) * R;
    return [C + rr * Math.cos(angle(i)), C + rr * Math.sin(angle(i))];
  };
  const poly = (values: number[]) => values.map((v, i) => point(i, v).join(",")).join(" ");

  const clubVals = axes.map((a) => statByKey.get(a.key)?.avg ?? 0);
  const myVals = axes.map((a) => myAxes[a.key] ?? 0);
  const hasClub = clubVals.some((v) => v > 0);
  const hasMine = myVals.some((v) => v > 0);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="rating-radar" role="img" aria-label={language === "en" ? "Club rating radar" : "Radar de valoración del club"}>
      {/* Anillos + radios */}
      {[2, 4, 6, 8, 10].map((ring) => (
        <polygon key={ring} points={poly(axes.map(() => ring))} fill="none" stroke="var(--line)" strokeWidth="1" opacity={ring === 10 ? 0.9 : 0.5} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, 10);
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" opacity="0.5" />;
      })}
      {/* Media del club (relleno) */}
      {hasClub ? (
        <polygon points={poly(clubVals)} fill="color-mix(in srgb, var(--brand) 22%, transparent)" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
      ) : null}
      {/* Tu capa (contorno) */}
      {hasMine ? (
        <polygon points={poly(myVals)} fill="none" stroke="var(--star-gold)" strokeWidth="2" strokeDasharray="4 3" strokeLinejoin="round" />
      ) : null}
      {/* Etiquetas de eje */}
      {axes.map((a, i) => {
        const [x, y] = point(i, 12.1);
        const anchor = Math.abs(x - C) < 8 ? "middle" : x > C ? "start" : "end";
        return (
          <text key={a.key} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="rating-radar-label">
            {a.label(language)}
          </text>
        );
      })}
    </svg>
  );
};
