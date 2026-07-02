// Portada editorial generada para libros sin imagen: composición tipográfica
// de clásico de bolsillo (banda de autor, título en serif, marca al pie) sobre
// papel entintado. La tinta es determinista por título, así cada libro conserva
// su color en toda la app. Sustituye al placeholder gris con icono.

interface GeneratedCoverProps {
  title: string;
  author?: string | null;
  /** card = tarjeta de estantería · lg = héroe de la ficha */
  size?: "card" | "lg";
  className?: string;
}

const TINT_COUNT = 6;

// Hash simple y estable (suma de códigos) → misma tinta para el mismo título.
const tintIndex = (title: string): number => {
  let acc = 0;
  for (let i = 0; i < title.length; i++) acc = (acc + title.charCodeAt(i) * (i + 1)) % 9973;
  return acc % TINT_COUNT;
};

export const GeneratedCover = ({ title, author, size = "card", className = "" }: GeneratedCoverProps) => (
  <span className={`gen-cover gen-cover-${size} gen-cover-tint-${tintIndex(title)} ${className}`.trim()} aria-hidden="true">
    <span className="gen-cover-frame">
      {author ? <span className="gen-cover-author">{author}</span> : <span className="gen-cover-author gen-cover-author-empty">· · ·</span>}
      <span className="gen-cover-title">{title}</span>
      <span className="gen-cover-mark">w.</span>
    </span>
  </span>
);
