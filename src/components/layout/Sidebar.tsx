import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Briefcase,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  History,
  Bell,
  Building2,
  ClipboardCheck,
  Clock3,
  FileClock,
  Gauge,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  LineChart,
  ListChecks,
  ListTodo,
  LogOut,
  MessagesSquare,
  Monitor,
  Settings,
  ShieldCheck,
  Stamp,
  Timer,
  UserCircle,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useNotifications } from '../../lib/notifications/NotificationsContext';
import type { PermissionCode } from '../../types';
import { findActiveSection, parseOpenSections } from '../../utils/navigation';
import type { NavigationTarget, OpenSections } from '../../utils/navigation';
import { BrandMark } from './BrandMark';

interface NavigationItem extends NavigationTarget {
  label: string;
  icon: LucideIcon;
  /** Sem permissão indicada, o item está disponível para qualquer conta com acesso. */
  permission?: PermissionCode;
}

type SectionId = 'work' | 'team' | 'it' | 'analysis' | 'administration' | 'account';

interface NavigationSection {
  id: SectionId;
  title: string;
  items: NavigationItem[];
}

// Área de gestão de equipa: apresentada a gestores, sempre condicionada à permissão.
const TEAM_ITEMS: NavigationItem[] = [
  { to: '/team', label: 'Minha Equipa', icon: Users, permission: 'TEAM_READ' },
  { to: '/approvals', label: 'Aprovações', icon: ClipboardCheck, permission: 'TEAM_TIMESHEET_REVIEW' },
  { to: '/activity', label: 'Atividade', icon: History, permission: 'TEAM_TIMESHEET_READ' },
  { to: '/timesheet/reports', label: 'Relatórios da equipa', icon: LineChart, permission: 'TEAM_READ' },
];

// Trabalho (Timesheet Core): cada entrada depende da permissão correspondente.
const WORK_ITEMS: NavigationItem[] = [
  { to: '/timesheet', label: 'Centro de trabalho', icon: LayoutGrid, permission: 'TIMESHEET_TASK_READ', end: true },
  { to: '/timesheet/tasks', label: 'Tarefas', icon: ListTodo, permission: 'TIMESHEET_TASK_READ' },
  { to: '/timesheet/calendar', label: 'Calendário', icon: CalendarDays, permission: 'TIMESHEET_CALENDAR_READ' },
  { to: '/timesheet/meetings', label: 'Reuniões', icon: MessagesSquare, permission: 'TIMESHEET_MEETING_READ' },
  { to: '/timesheet/activities', label: 'Atividades', icon: Timer, permission: 'SELF_TIMESHEET_READ' },
  { to: '/timesheet/absences', label: 'Ausências', icon: CalendarOff, permission: 'TIMESHEET_ABSENCE_CREATE' },
  { to: '/timesheet/opportunities', label: 'Oportunidades', icon: Briefcase, permission: 'TIMESHEET_OPPORTUNITY_READ' },
  { to: '/timesheet/approvals', label: 'Pedidos de aprovação', icon: Stamp, permission: 'TIMESHEET_OPPORTUNITY_READ' },
  { to: '/timesheet/team', label: 'Carga da equipa', icon: UsersRound, permission: 'TEAM_READ' },
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

const ACCOUNT_ITEMS: NavigationItem[] = [
  { to: '/profile', label: 'Meu Perfil', icon: UserCircle },
  { to: '/notifications', label: 'Notificações', icon: Bell },
];

// Preferência de interface (não sensível): sobrevive à navegação e a novas sessões neste browser.
const OPEN_SECTIONS_STORAGE_KEY = 'tsheetgrt.sidebar.open-sections';

function readStoredOpenSections(): OpenSections {
  try {
    return parseOpenSections(window.localStorage.getItem(OPEN_SECTIONS_STORAGE_KEY));
  } catch {
    return {};
  }
}

function storeOpenSections(openSections: OpenSections): void {
  try {
    window.localStorage.setItem(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
  } catch {
    // Armazenamento indisponível (modo privado, bloqueado): o menu funciona sem memória.
  }
}

// Contorno de foco branco: o verde do foco global não tem contraste suficiente sobre o fundo do menu.
const FOCUS_CLASS = 'focus-visible:outline-white';

function navigationLinkClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${FOCUS_CLASS} ${
    isActive ? 'bg-primary text-on-primary' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
  }`;
}

const CountBadge: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-sidebar">
    {value > 99 ? '99+' : value}
    <span className="sr-only"> {label}</span>
  </span>
);

interface SidebarLinkProps extends NavigationItem {
  badge?: number;
  onNavigate?: () => void;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ to, label, icon: Icon, end, badge = 0, onNavigate }) => (
  <li>
    <NavLink to={to} end={end} className={navigationLinkClass} onClick={onNavigate}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
      {badge > 0 && <CountBadge value={badge} label="por ler" />}
    </NavLink>
  </li>
);

interface SidebarSectionProps {
  id: SectionId;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  /** Total a destacar no título quando a secção está recolhida (ex.: notificações por ler). */
  badge: number;
  children: React.ReactNode;
}

const SidebarSection: React.FC<SidebarSectionProps> = ({ id, title, isOpen, onToggle, badge, children }) => {
  const listId = `menu-seccao-${id}`;
  return (
    <div className="border-t border-white/15 pt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={listId}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-sidebar-muted hover:bg-sidebar-hover hover:text-white ${FOCUS_CLASS}`}
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className="flex-1">{title}</span>
        {!isOpen && badge > 0 && <CountBadge value={badge} label="por ler" />}
      </button>
      <ul id={listId} hidden={!isOpen} className="mt-1 space-y-1">
        {children}
      </ul>
    </div>
  );
};

interface SidebarProps {
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { currentUser, role, hasPermission, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { pathname } = useLocation();

  // Gestão de equipa: o gestor gere a equipa direta; o Manager supervisiona os gestores e as suas equipas.
  const isTeamManager = role === 'MANAGER' || role === 'GESTOR';
  const showOwnTimesheet = (role === 'EMPLOYEE' || role === 'MANAGER' || role === 'GESTOR') && hasPermission('SELF_TIMESHEET_READ');
  const showSupportRequests = hasPermission('IT_TICKET_CREATE');
  const allowed = (items: NavigationItem[]) => items.filter((item) => !item.permission || hasPermission(item.permission));

  const candidateSections: NavigationSection[] = [
    { id: 'work', title: 'Trabalho', items: allowed(WORK_ITEMS) },
    { id: 'team', title: 'Gestão de equipa', items: isTeamManager ? allowed(TEAM_ITEMS) : [] },
    { id: 'it', title: 'Suporte IT', items: allowed(IT_ITEMS) },
    { id: 'analysis', title: 'Análise', items: allowed(ANALYSIS_ITEMS) },
    { id: 'administration', title: 'Administração', items: allowed(ADMINISTRATION_ITEMS) },
    { id: 'account', title: 'Conta', items: ACCOUNT_ITEMS },
  ];
  const sections = candidateSections.filter((section) => section.items.length > 0);

  const badges: Partial<Record<string, number>> = { '/notifications': unreadCount };
  const activeSectionId = findActiveSection(sections, pathname);

  // A secção da página atual começa aberta; as restantes ficam como o utilizador as deixou.
  const [openSections, setOpenSections] = useState<OpenSections>(() => {
    const stored = readStoredOpenSections();
    return activeSectionId ? { ...stored, [activeSectionId]: true } : stored;
  });

  // Ao chegar a outra página (pelo menu, um atalho ou uma notificação), abre a secção que a contém.
  // Só reage à mudança de página: o utilizador pode recolher a secção atual sem que ela volte a abrir.
  useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((previous) => (previous[activeSectionId] ? previous : { ...previous, [activeSectionId]: true }));
  }, [activeSectionId, pathname]);

  useEffect(() => {
    storeOpenSections(openSections);
  }, [openSections]);

  const toggleSection = (sectionId: SectionId) =>
    setOpenSections((previous) => ({ ...previous, [sectionId]: !previous[sectionId] }));

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-white">
      <div className="border-b border-white/15 px-5 py-4">
        <BrandMark inverted />
      </div>

      <nav aria-label="Navegação principal" className="flex-1 space-y-2 overflow-y-auto px-3 py-4 custom-scrollbar">
        <ul className="space-y-1 pb-2">
          <SidebarLink to="/dashboard" label="Dashboard" icon={LayoutDashboard} onNavigate={onNavigate} />

          {showOwnTimesheet && (
            <SidebarLink to="/timesheets" label="Meu Timesheet" icon={Clock3} onNavigate={onNavigate} />
          )}

          {showSupportRequests && (
            <SidebarLink to="/support" label="Pedidos de suporte" icon={LifeBuoy} onNavigate={onNavigate} />
          )}
        </ul>

        {sections.map((section) => (
          <SidebarSection
            key={section.id}
            id={section.id}
            title={section.title}
            isOpen={openSections[section.id] ?? false}
            onToggle={() => toggleSection(section.id)}
            badge={section.items.reduce((total, item) => total + (badges[item.to] ?? 0), 0)}
          >
            {section.items.map((item) => (
              <SidebarLink key={item.to} {...item} badge={badges[item.to]} onNavigate={onNavigate} />
            ))}
          </SidebarSection>
        ))}
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
            className={`shrink-0 rounded-md p-2 text-sidebar-muted hover:bg-sidebar-hover hover:text-white ${FOCUS_CLASS}`}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
};
