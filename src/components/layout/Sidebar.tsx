import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  History,
  Bell,
  Building2,
  ClipboardCheck,
  Clock3,
  FileClock,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Monitor,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import type { PermissionCode } from '../../types';
import { BrandMark } from './BrandMark';

interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: PermissionCode;
  /** Ativo apenas no caminho exato (ex.: "/it" não deve ficar ativo em "/it/tickets"). */
  end?: boolean;
}

// Área de gestão de equipa: apresentada a gestores, sempre condicionada à permissão.
const TEAM_ITEMS: NavigationItem[] = [
  { to: '/team', label: 'Minha Equipa', icon: Users, permission: 'TEAM_READ' },
  { to: '/approvals', label: 'Aprovações', icon: ClipboardCheck, permission: 'TEAM_TIMESHEET_REVIEW' },
  { to: '/activity', label: 'Atividade', icon: History, permission: 'TEAM_TIMESHEET_READ' },
];

// Área da equipa de IT: cada entrada depende da permissão correspondente.
const IT_ITEMS: NavigationItem[] = [
  { to: '/it', label: 'Visão geral', icon: Gauge, permission: 'IT_TICKETS_READ', end: true },
  { to: '/it/tickets', label: 'Solicitações', icon: ListChecks, permission: 'IT_TICKETS_READ' },
  { to: '/it/assets', label: 'Ativos', icon: Monitor, permission: 'IT_ASSETS_READ' },
  { to: '/it/interventions', label: 'Intervenções', icon: Wrench, permission: 'IT_TICKETS_READ' },
];

const ANALYSIS_ITEMS: NavigationItem[] = [
  { to: '/reports', label: 'Relatórios', icon: BarChart3, permission: 'REPORTS_READ' },
];

const ADMINISTRATION_ITEMS: NavigationItem[] = [
  { to: '/users', label: 'Utilizadores', icon: Users, permission: 'USERS_READ' },
  { to: '/departments', label: 'Departamentos', icon: Building2, permission: 'DEPARTMENTS_READ' },
  { to: '/roles', label: 'Roles e Permissões', icon: ShieldCheck, permission: 'ROLES_READ' },
  { to: '/audit', label: 'Auditoria', icon: FileClock, permission: 'AUDIT_READ' },
  { to: '/system-health', label: 'Saúde do Sistema', icon: Activity, permission: 'SYSTEM_HEALTH_READ' },
  { to: '/settings', label: 'Configurações', icon: Settings, permission: 'SYSTEM_SETTINGS_READ' },
];

function navigationLinkClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-primary text-on-primary' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
  }`;
}

interface SidebarLinkProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  onNavigate?: () => void;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ to, label, icon: Icon, end, onNavigate }) => (
  <li>
    <NavLink to={to} end={end} className={navigationLinkClass} onClick={onNavigate}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  </li>
);

const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border-t border-white/15 pt-4">
    <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">{title}</p>
    <ul className="space-y-1">{children}</ul>
  </div>
);

interface SidebarProps {
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { currentUser, role, hasPermission, signOut } = useAuth();

  const isTeamManager = role === 'MANAGER';
  const showOwnTimesheet = (role === 'EMPLOYEE' || role === 'MANAGER') && hasPermission('SELF_TIMESHEET_READ');
  const visibleTeamItems = isTeamManager ? TEAM_ITEMS.filter((item) => hasPermission(item.permission)) : [];
  const showSupportRequests = hasPermission('IT_TICKET_CREATE');
  const visibleItItems = IT_ITEMS.filter((item) => hasPermission(item.permission));
  const visibleAnalysisItems = ANALYSIS_ITEMS.filter((item) => hasPermission(item.permission));
  const visibleAdministrationItems = ADMINISTRATION_ITEMS.filter((item) => hasPermission(item.permission));

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-white">
      <div className="border-b border-white/15 px-5 py-4">
        <BrandMark inverted />
      </div>

      <nav aria-label="Navegação principal" className="flex-1 space-y-4 overflow-y-auto px-3 py-4 custom-scrollbar">
        <ul className="space-y-1">
          <SidebarLink to="/dashboard" label="Dashboard" icon={LayoutDashboard} onNavigate={onNavigate} />

          {showOwnTimesheet && (
            <SidebarLink to="/timesheets" label="Meu Timesheet" icon={Clock3} onNavigate={onNavigate} />
          )}

          {showSupportRequests && (
            <SidebarLink to="/support" label="Pedidos de suporte" icon={LifeBuoy} onNavigate={onNavigate} />
          )}
        </ul>

        {visibleTeamItems.length > 0 && (
          <SidebarSection title="Gestão de equipa">
            {visibleTeamItems.map((item) => (
              <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </SidebarSection>
        )}

        {visibleItItems.length > 0 && (
          <SidebarSection title="Suporte IT">
            {visibleItItems.map((item) => (
              <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </SidebarSection>
        )}

        {visibleAnalysisItems.length > 0 && (
          <SidebarSection title="Análise">
            {visibleAnalysisItems.map((item) => (
              <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </SidebarSection>
        )}

        {visibleAdministrationItems.length > 0 && (
          <SidebarSection title="Administração">
            {visibleAdministrationItems.map((item) => (
              <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </SidebarSection>
        )}

        <SidebarSection title="Conta">
          <SidebarLink to="/profile" label="Meu Perfil" icon={UserCircle} onNavigate={onNavigate} />
          <SidebarLink to="/notifications" label="Notificações" icon={Bell} onNavigate={onNavigate} />
        </SidebarSection>
      </nav>

      {currentUser && (
        <div className="flex items-center justify-between gap-2 border-t border-white/15 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{currentUser.full_name}</p>
            <p className="truncate text-xs text-sidebar-muted">{currentUser.role?.name ?? 'Sem perfil de acesso'}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            aria-label="Terminar sessão"
            title="Terminar sessão"
            className="shrink-0 rounded-md p-2 text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
};
