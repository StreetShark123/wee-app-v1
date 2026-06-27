// Convierte un índice pegado (corta-y-pega) en una lista de títulos de capítulo.
// - Con saltos de línea: cada línea no vacía es un capítulo.
// - Sin saltos: separa por marcadores tipo "Capítulo N" / "Chapter N" / "Cap. N".
export const parseChapterList = (raw: string): string[] => {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return [];
  const pieces = text.includes("\n")
    ? text.split("\n")
    : text.split(/(?=(?:cap[íi]tulo|chapter|cap\.)\s+[\dIVXLCM]+)/i);
  return pieces
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .slice(0, 400);
};
