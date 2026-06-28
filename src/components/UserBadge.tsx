import { hueForUser } from "../lib/userColor";

// Insignia de autor: avatar inicial coloreado + nombre en su color (estable por usuario).
export const UserBadge = ({ alias, withAvatar = false }: { alias: string; withAvatar?: boolean }) => {
  const hue = hueForUser(alias);
  const initial = (alias || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="user-badge">
      {withAvatar ? (
        <span
          className="user-badge-avatar"
          style={{ background: `hsl(${hue} 45% 40%)`, borderColor: `hsl(${hue} 65% 62%)` }}
          aria-hidden="true"
        >
          {initial}
        </span>
      ) : null}
      <span className="user-badge-name" style={{ color: `hsl(${hue} 72% 72%)` }}>{alias}</span>
    </span>
  );
};

// Solo el avatar inicial (para apilar los lectores de un capítulo).
export const UserDot = ({ alias, title }: { alias: string; title?: string }) => {
  const hue = hueForUser(alias);
  const initial = (alias || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="user-dot" style={{ background: `hsl(${hue} 45% 40%)`, borderColor: `hsl(${hue} 65% 62%)` }} title={title ?? alias}>
      {initial}
    </span>
  );
};
