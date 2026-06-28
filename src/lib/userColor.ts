// Color estable por usuario. Preferimos el índice de color REPARTIDO en el club
// (orden de ingreso → colores distintos garantizados, sin colisiones); si por lo que
// sea no llega, caemos a un hash del alias.
const PALETTE_HUES = [210, 28, 145, 290, 50, 330, 180, 100, 255, 8, 170, 312];

export const hueForUser = (key: string): number => {
  const s = key || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export const userHue = (colorIndex: number | null | undefined, alias: string): number =>
  colorIndex == null
    ? hueForUser(alias)
    : PALETTE_HUES[((colorIndex % PALETTE_HUES.length) + PALETTE_HUES.length) % PALETTE_HUES.length];
