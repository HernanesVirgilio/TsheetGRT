import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../lib/auth/AuthContext';
import { X, ShieldAlert } from 'lucide-react';

export const AppShell: React.FC = () => {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#1F5FAD] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">A carregar ambiente corporativo...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Force password change on development initial accounts before accessing protected modules
  if (mustChangePassword && location.pathname !== '/alterar-palavra-passe') {
    return <Navigate to="/alterar-palavra-passe" replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F7FA]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-2xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex flex-col w-72 max-w-xs bg-white shadow-xl z-50">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
            <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Forced Password Banner if on change-password page */}
        {mustChangePassword && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-900 shrink-0">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Primeiro acesso detetado:</strong> Por motivos de segurança institucional, é obrigatório alterar a palavra-passe inicial antes de aceder aos restantes módulos.
            </span>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
