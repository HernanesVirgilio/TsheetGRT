import React, { useState, useRef, useEffect } from 'react';
import { Menu, User, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { NotificationDropdown } from './NotificationDropdown';
import { UserAvatar } from '../ui/UserAvatar';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const { currentUser, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-[#D9E0E7] px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
      {/* Mobile Drawer Trigger & Institutional Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">SI HOLDINGS</span>
          <span>/</span>
          <span>SISTEMA DE OPERAÇÕES & TIMESHEET</span>
        </div>
      </div>

      {/* Right Actions: Notifications & User Profile Menu */}
      <div className="flex items-center gap-3">
        {/* Environment Tag */}
        <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
          Operações Internas · Maputo
        </span>

        {/* Notifications */}
        <NotificationDropdown />

        <div className="h-5 w-px bg-slate-200" />

        {/* User Menu */}
        {currentUser && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 transition focus:outline-none"
              aria-expanded={userMenuOpen}
              aria-label="Menu do utilizador"
            >
              <UserAvatar name={currentUser.full_name} size="sm" />
              <span className="hidden md:block text-xs font-medium text-slate-700 text-left max-w-36 truncate">
                {currentUser.full_name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-[#D9E0E7] py-1 z-50">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                  <p className="text-xs font-semibold text-slate-800 truncate">{currentUser.full_name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                  <p className="text-[11px] text-[#1F5FAD] font-medium mt-0.5">
                    {currentUser.job_title || 'Colaborador'}
                  </p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/profile');
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>Meu Perfil</span>
                  </button>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/alterar-palavra-passe');
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                    <span>Alterar palavra-passe</span>
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-1">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#C0392B] hover:bg-red-50 text-left font-medium"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Terminar sessão</span>
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
