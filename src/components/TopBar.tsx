import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { pick, useI18n } from "../lib/i18n";
import { getSelectedCommunity } from "../lib/communitySession";
import type { User } from "../lib/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { NotificationsMenu } from "./NotificationsMenu";

interface TopBarProps {
  user: User;
  communityName?: string;
  onLeaveCommunity?: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onOpenShare?: () => void;
  onLogout?: () => void;
}

export const TopBar = ({ user, communityName, onLeaveCommunity, searchValue, onSearchChange, onOpenShare, onLogout }: TopBarProps) => (
  <TopBarInner
    user={user}
    communityName={communityName}
    onLeaveCommunity={onLeaveCommunity}
    searchValue={searchValue}
    onSearchChange={onSearchChange}
    onOpenShare={onOpenShare}
    onLogout={onLogout}
  />
);

const TopBarInner = ({ user, communityName, onLeaveCommunity, searchValue, onSearchChange, onOpenShare, onLogout }: TopBarProps) => {
  const { language } = useI18n();
  const fallbackCommunity = getSelectedCommunity();
  const communityLabel = communityName ?? fallbackCommunity?.name;
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) setProfileOpen(false);
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <header className="topbar">
      <Link to="/home" className="brand">
        <span className="brand-copy">
          <span className="brand-text">Wee</span>
          <span className="brand-tag">{communityLabel ? `${communityLabel}` : pick(language, "tu club", "your community", "a túa comunidade")}</span>
        </span>
      </Link>

      {onSearchChange ? (
        <label className="topbar-search" aria-label={pick(language, "Buscar por libro, autor o tema", "Search by topic or keyword", "Buscar por tema ou palabra")}>
          <Icon name="search" size={14} />
          <input
            value={searchValue ?? ""}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={pick(language, "Busca libro, autor o tema...", "Search topic, keyword or source...", "Busca tema, palabra ou fonte...")}
          />
        </label>
      ) : null}

      <div className="topbar-right">
        <NotificationsMenu />

        <div className="topbar-user-menu" ref={profileMenuRef}>
          <button
            type="button"
            className="user-link user-menu-trigger"
            onClick={() => setProfileOpen((curr) => !curr)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
          >
            <Avatar user={user} size={32} />
            <span className="user-menu-label"><Icon name="user" size={13} /> {user.alias}</span>
            <span className="user-menu-caret">▾</span>
          </button>

          {profileOpen ? (
            <div className="user-menu-dropdown" role="menu" aria-label={pick(language, "Menú de perfil", "Profile menu", "Menú de perfil")}>
              <div className="user-menu-header">
                <Avatar user={user} size={28} />
                <div>
                  <strong>{user.alias}</strong>
                  <span>{pick(language, "Tu espacio", "Your space", "O teu espazo")}</span>
                </div>
              </div>
              <Link to={`/profile/${user.id}`} role="menuitem" className="user-menu-item" onClick={() => setProfileOpen(false)}>
                <Icon name="user" size={13} /> {pick(language, "Perfil", "Profile", "Perfil")}
              </Link>
              <Link to="/community" role="menuitem" className="user-menu-item" onClick={() => setProfileOpen(false)}>
                <Icon name="users" size={13} /> {pick(language, "Club", "Community", "Comunidade")}
              </Link>
              <Link to="/settings" role="menuitem" className="user-menu-item" onClick={() => setProfileOpen(false)}>
                <Icon name="settings" size={13} /> {pick(language, "Ajustes", "Settings", "Axustes")}
              </Link>
              {onLeaveCommunity ? (
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item user-menu-item-danger"
                  onClick={() => {
                    setProfileOpen(false);
                    onLeaveCommunity();
                  }}
                >
                  <Icon name="logout" size={13} /> {pick(language, "Salir del club", "Leave community", "Saír da comunidade")}
                </button>
              ) : null}
              {onLogout ? (
                <button
                  type="button"
                  role="menuitem"
                  className="user-menu-item user-menu-item-danger"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                >
                  <Icon name="logout" size={13} /> {pick(language, "Cerrar sesión", "Log out", "Pechar sesión")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
