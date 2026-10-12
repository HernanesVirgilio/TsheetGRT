import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, ChevronRight, Clock3, FileClock, LifeBuoy, RefreshCw, UserCircle, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { canAccessPath } from '../../lib/auth/routeAccess';
import { DashboardHeader } from '../../components/layout/DashboardHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { t, translatedFields } from '../../lib/i18n';

interface Shortcut {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

// Áreas que não têm painel próprio; cada atalho só aparece se a rota for acessível ao utilizador.
const SHORTCUTS: Shortcut[] = translatedFields([
  { to: '/timesheets', label: 'Timesheet', description: 'Registar horas e submeter o período para aprovação.', icon: Clock3 },
  { to: '/support', label: 'Pedidos de suporte', description: 'Pedir ajuda à equipa de IT e acompanhar os seus pedidos.', icon: LifeBuoy },
  { to: '/reports', label: 'Relatórios', description: 'Consultar indicadores de horas e timesheets.', icon: BarChart3 },
  { to: '/users', label: 'Utilizadores', description: 'Consultar as contas registadas.', icon: Users },
  { to: '/audit', label: 'Auditoria', description: 'Consultar o registo de eventos do sistema.', icon: FileClock },
  { to: '/system-health', label: 'Saúde do sistema', description: 'Verificar o estado dos serviços.', icon: Activity },
], ['label', 'description']);

/** Conta ativa sem nenhuma permissão funcional: explica a situação em vez de mostrar erros de acesso. */
const AwaitingAccess: React.FC = () => {
  const { refreshProfile } = useAuth();
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = async () => {
    setIsChecking(true);
    await refreshProfile();
    setIsChecking(false);
  };

  return (
    <Panel>
      <div className="space-y-4">
        <Alert variant="info" title={t('A sua conta está ativa')}>
          {t('Ainda não lhe foram atribuídas funcionalidades no TsheetGRT (perfil de acesso e permissões). Contacte o administrador do sistema ou o seu responsável direto e indique o e-mail com que entrou. Assim que o acesso for atribuído, os módulos aparecem automaticamente no menu.')}
        </Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" icon={RefreshCw} isLoading={isChecking} onClick={handleCheck}>
            {t('Verificar novamente')}
          </Button>
          <Link
            to="/profile"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border-input bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            <UserCircle className="h-4 w-4" aria-hidden="true" />
            {t('Ver o meu perfil')}
          </Link>
        </div>
      </div>
    </Panel>
  );
};

/** Página inicial para quem não tem um painel de trabalho próprio: atalhos para as áreas autorizadas. */
export const StartDashboard: React.FC = () => {
  const { hasPermission } = useAuth();
  const shortcuts = SHORTCUTS.filter((shortcut) => canAccessPath(shortcut.to, hasPermission));

  return (
    <div className="space-y-6">
      <DashboardHeader message={t('As áreas do TsheetGRT disponíveis para o seu perfil.')} />
      {shortcuts.length === 0 ? (
        <AwaitingAccess />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map(({ to, label, description, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full items-start gap-3 rounded-lg border border-border bg-surface p-4 hover:border-primary hover:bg-primary-soft"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-hover" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{label}</span>
                  <span className="mt-0.5 block text-sm text-text-secondary">{description}</span>
                </span>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
