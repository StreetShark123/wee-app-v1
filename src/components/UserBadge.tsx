import { hueForUser } from "../lib/userColor";
import { Icon, type IconName } from "./Icon";

// Repertorio de glifos para quien no tiene avatar: estable por usuario.
const GLYPHS: IconName[] = ["heart", "spiral", "spark", "flame", "bolt", "target", "leaf", "moon", "star", "diamond"];
const glyphForUser = (key: string): IconName => {
  const s = key || "?";
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 17 + s.charCodeAt(i)) % GLYPHS.length;
  return GLYPHS[h];
};

// Insignia de autor: avatar de glifo coloreado + nombre en su color (estable por usuario).
export const UserBadge = ({ alias, withAvatar = false }: { alias: string; withAvatar?: boolean }) => {
  const hue = hueForUser(alias);
  return (
    <span className="user-badge">
      {withAvatar ? (
        <span
          className="user-badge-avatar"
          style={{ background: `hsl(${hue} 45% 40%)`, borderColor: `hsl(${hue} 65% 62%)` }}
          aria-hidden="true"
        >
          <Icon name={glyphForUser(alias)} size={13} />
        </span>
      ) : null}
      <span className="user-badge-name" style={{ color: `hsl(${hue} 72% 72%)` }}>{alias}</span>
    </span>
  );
};

// Solo el avatar de glifo (para apilar los lectores de un capítulo).
export const UserDot = ({ alias, title }: { alias: string; title?: string }) => {
  const hue = hueForUser(alias);
  return (
    <span className="user-dot" style={{ background: `hsl(${hue} 45% 40%)`, borderColor: `hsl(${hue} 65% 62%)` }} title={title ?? alias}>
      <Icon name={glyphForUser(alias)} size={12} />
    </span>
  );
};
