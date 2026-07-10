import type { ClubMemberLite } from "../lib/communityApi";
import { userHue } from "../lib/userColor";
import { Icon, type IconName } from "./Icon";

// Repertorio de glifos para quien no tiene avatar: estable por usuario.
const GLYPHS: IconName[] = ["heart", "spiral", "spark", "flame", "bolt", "target", "leaf", "moon", "star", "diamond"];
const glyphForUser = (key: string): IconName => {
  const s = key || "?";
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 17 + s.charCodeAt(i)) % GLYPHS.length;
  return GLYPHS[h];
};

// Estilo de autoría a partir de la lista de miembros (avatar real + color repartido).
export const styleFor = (members: ClubMemberLite[], userId?: string): { avatarUrl?: string; colorIndex?: number } => {
  const m = userId ? members.find((x) => x.id === userId) : undefined;
  return { avatarUrl: m?.avatarUrl, colorIndex: m?.colorIndex };
};

interface BadgeProps {
  alias: string;
  avatarUrl?: string;
  colorIndex?: number;
}

// Insignia de autor: avatar real si existe, si no glifo coloreado; nombre en su color.
export const UserBadge = ({ alias, avatarUrl, colorIndex, withAvatar = false }: BadgeProps & { withAvatar?: boolean }) => {
  const hue = userHue(colorIndex, alias);
  return (
    <span className="user-badge">
      {withAvatar ? (
        avatarUrl ? (
          <img className="user-badge-avatar user-avatar-photo" src={avatarUrl} alt="" style={{ borderColor: `hsl(${hue} 65% 62%)` }} />
        ) : (
          <span className="user-badge-avatar" style={{ background: `hsl(${hue} 45% 40%)`, borderColor: `hsl(${hue} 65% 62%)` }} aria-hidden="true">
            <Icon name={glyphForUser(alias)} size={13} />
          </span>
        )
      ) : null}
      <span className="user-badge-name" style={{ color: `hsl(${hue} 55% 34%)` }}>{alias}</span>
    </span>
  );
};

// Solo el avatar (para apilar los lectores de un capítulo). `done`: en vistas
// compactas (la card de la estantería), quien ya terminó se funde en un check
// genérico — así destacan, por contraste, quienes aún faltan por leer.
export const UserDot = ({ alias, avatarUrl, colorIndex, title, done }: BadgeProps & { title?: string; done?: boolean }) => {
  const hue = userHue(colorIndex, alias);
  if (done) {
    return (
      <span className="user-dot user-dot-done" title={title ?? alias}>
        <Icon name="check" size={11} />
      </span>
    );
  }
  return avatarUrl ? (
    <img className="user-dot user-avatar-photo" src={avatarUrl} alt="" title={title ?? alias} style={{ borderColor: `hsl(${hue} 65% 62%)` }} />
  ) : (
    <span className="user-dot" style={{ background: `hsl(${hue} 45% 40%)`, borderColor: `hsl(${hue} 65% 62%)` }} title={title ?? alias}>
      <Icon name={glyphForUser(alias)} size={12} />
    </span>
  );
};
