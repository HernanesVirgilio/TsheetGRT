// Arquitetura de informação da aplicação: um destino por capacidade, agrupado por finalidade.
// Usada pelo menu lateral (o que mostrar) e pelo cabeçalho (onde o utilizador está).
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  Clock3,
  FileClock,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  ListTodo,
  MessagesSquare,
  Monitor,
  Settings,
  ShieldCheck,
  Timer,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PermissionCode } from '../../types';
import { ABSENCE_PERMISSIONS, APPROVAL_CENTER_PERMISSIONS, meetsRequirement, REPORTS_PERMISSIONS } from '../../lib/auth/routeAccess';
import type { RouteRequirement } from '../../lib/auth/routeAccess';
import { isNavigationItemActive } from '../../utils/navigation';
import type { NavigationTarget } from '../../utils/navigation';
import { translatedFields } from '../../lib/i18n';

export interface NavigationItem extends NavigationTarget {
  label: string;
  icon: LucideIcon;
  /** Sem requisito, o item está disponível para qualquer conta com acesso. */
  permission?: RouteRequirement;
  /** Caminhos que pertencem a este destino sem estarem por baixo dele (ex.: /approvals/:id). */
  alsoActiveOn?: string[];
}

export type SectionId = 'home' | 'work' | 'collaboration' | 'approvals' | 'analysis' | 'support' | 'administration';

export interface NavigationSection {
  id: SectionId;
  title: string;
  items: NavigationItem[];
}

const NAVIGATION: NavigationSection[] = translatedFields([
  {
    id: 'home',
    title: 'Início',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'work',
    title: 'Trabalho',
    items: [
      { to: '/timesheets', label: 'Timesheet', icon: Clock3, permission: 'SELF_TIMESHEET_READ' },
      { to: '/timesheet/tasks', label: 'Tarefas', icon: ListTodo, permission: 'TIMESHEET_TASK_READ' },
      { to: '/timesheet/calendar', label: 'Calendário', icon: CalendarDays, permission: 'TIMESHEET_CALENDAR_READ' },
      { to: '/timesheet/activities', label: 'Atividades', icon: Timer, permission: 'SELF_TIMESHEET_READ' },
      {
        to: '/timesheet/opportunities',
        label: 'Oportunidades',
        icon: Briefcase,
        permission: 'TIMESHEET_OPPORTUNITY_READ',
        alsoActiveOn: ['/timesheet/companies'],
      },
    ],
  },
  {
    id: 'collaboration',
    title: 'Colaboração',
    items: [
      { to: '/timesheet/meetings', label: 'Reuniões', icon: MessagesSquare, permission: 'TIMESHEET_MEETING_READ' },
      { to: '/team', label: 'Equipa', icon: UsersRound, permission: 'TEAM_READ' },
      { to: '/timesheet/absences', label: 'Disponibilidade', icon: CalendarOff, permission: ABSENCE_PERMISSIONS },
    ],
  },
  {
    id: 'approvals',
    title: 'Aprovações',
    items: [{ to: '/approvals', label: 'Aprovações', icon: ClipboardCheck, permission: APPROVAL_CENTER_PERMISSIONS }],
  },
  {
    id: 'analysis',
    title: 'Análise',
    items: [{ to: '/reports', label: 'Relatórios', icon: BarChart3, permission: REPORTS_PERMISSIONS }],
  },
  {
    id: 'support',
    title: 'Suporte',
    items: [
      { to: '/support', label: 'Pedidos de suporte', icon: LifeBuoy, permission: 'IT_TICKET_CREATE' },
      { to: '/it/tickets', label: 'Fila de suporte', icon: ListChecks, permission: 'IT_TICKETS_READ', alsoActiveOn: ['/it'] },
      { to: '/it/assets', label: 'Ativos', icon: Monitor, permission: 'IT_ASSETS_READ' },
      { to: '/it/interventions', label: 'Intervenções', icon: Wrench, permission: 'IT_TICKETS_READ' },
    ],
  },
  {
    id: 'administration',
    title: 'Administração',
    items: [
      { to: '/users', label: 'Utilizadores', icon: Users, permission: 'USERS_READ' },
      { to: '/departments', label: 'Departamentos', icon: Building2, permission: 'DEPARTMENTS_READ' },
      { to: '/roles', label: 'Roles e Permissões', icon: ShieldCheck, permission: 'ROLES_READ' },
      { to: '/settings', label: 'Configurações', icon: Settings, permission: 'SYSTEM_SETTINGS_READ' },
      { to: '/audit', label: 'Auditoria', icon: FileClock, permission: 'AUDIT_READ' },
      { to: '/system-health', label: 'Saúde do Sistema', icon: Activity, permission: 'SYSTEM_HEALTH_READ' },
    ],
  },
], ['title', 'label']);

/** Secções e itens que o utilizador pode abrir (o menu reflete as permissões efetivas, não o nome do perfil). */
export function visibleNavigation(hasPermission: (permission: PermissionCode) => boolean): NavigationSection[] {
  return NAVIGATION.map((section) => ({
    id: section.id,
    title: section.title,
    items: section.items.filter((item) => meetsRequirement(item.permission, hasPermission)),
  })).filter((section) => section.items.length > 0);
}

/** O item é o destino da página atual (o próprio caminho, os sub-caminhos ou caminhos associados). */
export function isItemCurrent(item: NavigationItem, pathname: string): boolean {
  return (
    isNavigationItemActive(item, pathname) ||
    (item.alsoActiveOn ?? []).some((path) => isNavigationItemActive({ to: path, end: path === '/it' }, pathname))
  );
}

/** Secção e destino da página atual, para o cabeçalho. Páginas de conta (perfil, notificações) não têm secção. */
export function currentLocation(sections: NavigationSection[], pathname: string): { section: NavigationSection; item: NavigationItem } | null {
  for (const section of sections) {
    const item = section.items.find((candidate) => isItemCurrent(candidate, pathname));
    if (item) return { section, item };
  }
  return null;
}
