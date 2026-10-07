import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock3,
  Users,
  ClipboardCheck,
  BarChart3,
  ShieldCheck,
  Building2,
  FileClock,
  Activity,
  Settings,
  UserCircle,
  Bell,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { UserAvatar } from '../ui/UserAvatar';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { currentUser, role, signOut, switchAccountForDev, mustChangePassword } = useAuth();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive
        ? 'bg-[#1F5FAD] text-white'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  const roleLabelMap: Record<string, string> = {
    ADMIN: 'ADMIN',
    IT: 'IT',
    MANAGER: 'GESTOR',
    EMPLOYEE: 'COLABORADOR',
  };

  return (
    <aside className="w-64 bg-white border-r border-[#D9E0E7] flex flex-col h-full shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#D9E0E7] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-[#1F5FAD] flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-xs">
            SI
          </div>
          <div>
            <div className="text-xs font-bold tracking-widest text-[#12304A] uppercase">
              SI Holdings
            </div>
            <div className="text-sm font-bold text-[#1F5FAD] tracking-tight">
              TIMESHEET
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 custom-scrollbar">
        {/* Core Operations */}
        <div className="space-y-1">
          <NavLink to="/dashboard" className={navItemClass} onClick={onCloseMobile}>
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>

          {/* Timesheets: available to Employee, Manager, Admin */}
          {(role === 'EMPLOYEE' || role === 'MANAGER') && (
            <NavLink to="/timesheets" className={navItemClass} onClick={onCloseMobile}>
              <Clock3 className="w-4 h-4 shrink-0" />
              <span>Meu Timesheet</span>
            </NavLink>
          )}

          {role === 'ADMIN' && (
            <NavLink to="/timesheets" className={navItemClass} onClick={onCloseMobile}>
              <Clock3 className="w-4 h-4 shrink-0" />
              <span>Timesheets</span>
            </NavLink>
          )}

          {/* Team / Approvals: Manager */}
          {role === 'MANAGER' && (
            <>
              <NavLink to="/team" className={navItemClass} onClick={onCloseMobile}>
                <Users className="w-4 h-4 shrink-0" />
                <span>Minha Equipa</span>
              </NavLink>
              <NavLink to="/approvals" className={navItemClass} onClick={onCloseMobile}>
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span>Aprovações</span>
              </NavLink>
            </>
          )}
        </div>

        {/* Management & Reports */}
        {(role === 'ADMIN' || role === 'MANAGER') && (
          <div className="space-y-1 pt-3 border-t border-slate-100">
            <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Análise & Gestão
            </div>
            <NavLink to="/reports" className={navItemClass} onClick={onCloseMobile}>
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Relatórios</span>
            </NavLink>
          </div>
        )}

        {/* Administration / IT */}
        {(role === 'ADMIN' || role === 'IT') && (
          <div className="space-y-1 pt-3 border-t border-slate-100">
            <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Administração
            </div>

            {/* Users: Admin & IT */}
            <NavLink to="/users" className={navItemClass} onClick={onCloseMobile}>
              <Users className="w-4 h-4 shrink-0" />
              <span>Utilizadores</span>
            </NavLink>

            {/* Departments: Admin only */}
            {role === 'ADMIN' && (
              <NavLink to="/departments" className={navItemClass} onClick={onCloseMobile}>
                <Building2 className="w-4 h-4 shrink-0" />
                <span>Departamentos</span>
              </NavLink>
            )}

            {/* Roles & Permissions: Admin only */}
            {role === 'ADMIN' && (
              <NavLink to="/roles" className={navItemClass} onClick={onCloseMobile}>
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Roles e Permissões</span>
              </NavLink>
            )}

            {/* Audit: Admin & IT */}
            <NavLink to="/audit" className={navItemClass} onClick={onCloseMobile}>
              <FileClock className="w-4 h-4 shrink-0" />
              <span>Auditoria</span>
            </NavLink>

            {/* System Health: Admin & IT */}
            <NavLink to="/system-health" className={navItemClass} onClick={onCloseMobile}>
              <Activity className="w-4 h-4 shrink-0" />
              <span>Saúde do Sistema</span>
            </NavLink>

            {/* Settings: Admin only */}
            {role === 'ADMIN' && (
              <NavLink to="/settings" className={navItemClass} onClick={onCloseMobile}>
                <Settings className="w-4 h-4 shrink-0" />
                <span>Configurações</span>
              </NavLink>
            )}
          </div>
        )}

        {/* General User Section */}
        <div className="space-y-1 pt-3 border-t border-slate-100">
          <div className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Conta
          </div>
          <NavLink to="/profile" className={navItemClass} onClick={onCloseMobile}>
            <UserCircle className="w-4 h-4 shrink-0" />
            <span>Meu Perfil</span>
          </NavLink>
          <NavLink to="/notifications" className={navItemClass} onClick={onCloseMobile}>
            <Bell className="w-4 h-4 shrink-0" />
            <span>Notificações</span>
          </NavLink>
        </div>
      </div>

      {/* Dev Account Switcher (Interactive Testing Support) */}
      <div className="px-3 py-2 bg-slate-50 border-t border-[#D9E0E7]">
        <button
          type="button"
          onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 rounded bg-white border border-slate-200"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Perfil: <strong>{roleLabelMap[role || ''] || role}</strong></span>
          </span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {showRoleSwitcher && (
          <div className="mt-1.5 p-1.5 bg-white rounded border border-slate-200 text-xs space-y-1 shadow-sm">
            <div className="text-[10px] uppercase font-semibold text-slate-400 px-1">Alternar conta de teste:</div>
            <button
              onClick={() => { switchAccountForDev('admin@siholdings-mz.com'); setShowRoleSwitcher(false); }}
              className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-100 flex items-center justify-between"
            >
              <span>ADMIN</span>
              <span className="text-[10px] text-slate-400">admin@</span>
            </button>
            <button
              onClick={() => { switchAccountForDev('it@siholdings-mz.com'); setShowRoleSwitcher(false); }}
              className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-100 flex items-center justify-between"
            >
              <span>IT</span>
              <span className="text-[10px] text-slate-400">it@</span>
            </button>
            <button
              onClick={() => { switchAccountForDev('manager@siholdings-mz.com'); setShowRoleSwitcher(false); }}
              className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-100 flex items-center justify-between"
            >
              <span>MANAGER</span>
              <span className="text-[10px] text-slate-400">manager@</span>
            </button>
            <button
              onClick={() => { switchAccountForDev('colaborador@siholdings-mz.com'); setShowRoleSwitcher(false); }}
              className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-100 flex items-center justify-between"
            >
              <span>COLABORADOR</span>
              <span className="text-[10px] text-slate-400">colaborador@</span>
            </button>
          </div>
        )}
      </div>

      {/* User Footer Card */}
      {currentUser && (
        <div className="p-3 border-t border-[#D9E0E7] bg-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <UserAvatar name={currentUser.full_name} size="sm" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 truncate leading-snug">
                  {currentUser.full_name}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {currentUser.email}
                </div>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="p-1.5 text-slate-400 hover:text-[#C0392B] hover:bg-red-50 rounded transition shrink-0"
              title="Terminar sessão"
              aria-label="Terminar sessão"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          {mustChangePassword && (
            <NavLink
              to="/alterar-palavra-passe"
              className="mt-2 block text-center text-[11px] py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium hover:bg-amber-100"
            >
              Alterar palavra-passe pendente
            </NavLink>
          )}
        </div>
      )}
    </aside>
  );
};
