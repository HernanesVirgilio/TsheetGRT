import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, KeyRound, LogOut, Menu, User } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { NotificationDropdown } from './NotificationDropdown';
import { UserAvatar } from '../ui/UserAvatar';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-text-secondary hover:bg-surface-muted hover:text-text';

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const { currentUser, signOut } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isUserMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsUserMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const goTo = (path: string) => {
    setIsUserMenuOpen(false);
    navigate(path);
  };

  return (
    <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Abrir menu de navegação"
          className="rounded-md p-2 text-text-secondary hover:bg-surface-muted lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="hidden text-sm text-text-secondary sm:block">
          <span className="font-semibold text-text">SI Holdings</span> · Operações e Timesheets
        </p>
      </div>

      <div className="flex items-center gap-2">
        <NotificationDropdown />

        {currentUser && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((isOpen) => !isOpen)}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              aria-label={`Menu de ${currentUser.full_name}`}
              className="flex items-center gap-2 rounded-md p-1.5 hover:bg-surface-muted"
            >
              <UserAvatar name={currentUser.full_name} size="sm" />
              <span className="hidden max-w-40 truncate text-sm font-medium text-text md:block">
                {currentUser.full_name}
              </span>
              <ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" />
            </button>

            {isUserMenuOpen && (
              <div role="menu" className="absolute right-0 mt-2 w-60 rounded-lg border border-border bg-surface py-1 shadow-lg">
                <div className="border-b border-border px-4 py-3">
                  <p className="truncate text-sm font-semibold text-text">{currentUser.full_name}</p>
                  <p className="truncate text-xs text-text-secondary">{currentUser.email}</p>
                </div>
                <button type="button" role="menuitem" className={MENU_ITEM_CLASS} onClick={() => goTo('/profile')}>
                  <User className="h-4 w-4" aria-hidden="true" />
                  Meu perfil
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={MENU_ITEM_CLASS}
                  onClick={() => goTo('/alterar-palavra-passe')}
                >
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Alterar palavra-passe
                </button>
                <div className="mt-1 border-t border-border pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-medium text-danger hover:bg-danger-soft"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      signOut();
                    }}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Terminar sessão
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
