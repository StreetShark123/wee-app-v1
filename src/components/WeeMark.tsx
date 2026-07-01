interface WeeMarkProps {
  size?: number;
}

// Marca de Wee: "W" en cuadrado de papel con borde (mismo diseño que el icono de
// la app, public/icon.svg) pero tokenizado para encajar con el tema en curso.
export const WeeMark = ({ size = 22 }: WeeMarkProps) => (
  <svg
    className="wee-mark"
    width={size}
    height={size}
    viewBox="0 0 64 64"
    role="img"
    aria-label="Wee"
    focusable="false"
  >
    <rect className="wee-mark-square" width="64" height="64" rx="14" />
    <rect className="wee-mark-border" x="2.5" y="2.5" width="59" height="59" rx="12" />
    <text className="wee-mark-w" x="32" y="46" textAnchor="middle">W</text>
  </svg>
);
