// Color estable por usuario (mismo alias → mismo tono). Para distinguir quién publica.
export const hueForUser = (key: string): number => {
  const s = key || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};
