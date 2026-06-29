import type { User } from "../lib/types";

interface AvatarProps {
  user: User;
  size?: number;
}

export const Avatar = ({ user, size = 36 }: AvatarProps) => {
  if (user.avatarDataUrl) {
    return (
      <img
        src={user.avatarDataUrl}
        alt={user.alias}
        width={size}
        height={size}
        className="avatar"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="avatar avatar-fallback"
      style={{ width: size, height: size, background: user.avatarColor ?? "var(--brand)" }}
      aria-label={user.alias}
      title={user.alias}
    >
      {user.initials ?? "U"}
    </div>
  );
};
