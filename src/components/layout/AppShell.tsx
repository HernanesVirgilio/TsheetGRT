import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../lib/auth/AuthContext';
import { LoadingState } from '../ui/States';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { BrandMark } from './BrandMark';

const AccessBlockedScreen: React.FC<{ reason: string }> = ({ reason }) => {
  const { signOut, refreshProfile } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    await refreshProfile();
    setIsRetrying(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <BrandMark />
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-6">
        <Alert variant="error" title="Acesso indisponível">
          {reason}
        </Alert>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" icon={RefreshCw} isLoading={isRetrying} onClick={handleRetry}>
            Tentar novamente
          </Button>
          <Button icon={LogOut} onClick={() => signOut()}>
            Terminar sessão
          </Button>
        </div>
      </div>
    </main>
  );
};

export const AppShell: React.FC = () => {
  const { status, accessError, mustChangePassword } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingState label="A carregar a sua sessão..." />
      </div>
    );
  }

  if (status === 'signed_out') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === 'no_access') {
    return <AccessBlockedScreen reason={accessError ?? 'Não tem acesso à aplicação.'} />;
  }

  if (mustChangePassword && location.pathname !== '/alterar-palavra-passe') {
    return <Navigate to="/alterar-palavra-passe" replace />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Saltar para o conteúdo
      </a>

      <div className="hidden shrink-0 lg:flex">
        <Sidebar />
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <div className="fixed inset-0 bg-black/40" aria-hidden="true" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative flex h-full">
            <Sidebar onNavigate={() => setIsMobileMenuOpen(false)} />
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-2 top-5 rounded-md p-1 text-white hover:bg-sidebar-hover"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />

        {mustChangePassword && (
          <div className="flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2.5 text-sm text-text">
            <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <strong>Ação necessária:</strong> defina uma nova palavra-passe antes de aceder aos restantes módulos.
            </span>
          </div>
        )}

        <main id="conteudo-principal" className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 custom-scrollbar">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
