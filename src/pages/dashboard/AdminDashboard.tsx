import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Building2,
  ClipboardCheck,
  Activity,
  ArrowRight,
  ShieldCheck,
  Settings,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { StatusBadge } from '../../components/ui/StatusBadge';

export const AdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [userCount, setUserCount] = useState(0);
  const [deptCount, setDeptCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [recentAudits, setRecentAudits] = useState<any[]>([]);
  const [recentProfiles, setRecentProfiles] = useState<any[]>([]);

  useEffect(() => {
    if (currentUser) {
      const profiles = dataService.getProfiles();
      setUserCount(profiles.length);
      setRecentProfiles(profiles.slice(0, 5));

      const depts = dataService.getDepartments();
      setDeptCount(depts.length);

      const allTs = dataService.getTimesheets(currentUser);
      setPendingApprovalsCount(allTs.filter((t) => t.status === 'SUBMITTED').length);

      const audits = dataService.getAuditEvents(1, 5);
      setRecentAudits(audits.items);
    }
  }, [currentUser]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel de Administração Global"
        subtitle="Supervisão operacional, gestão institucional de utilizadores, departamentos e segurança."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/users')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#D9E0E7] text-slate-700 text-xs font-semibold rounded hover:bg-slate-50 transition"
            >
              <Users className="w-3.5 h-3.5" />
              Gerir Utilizadores
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-xs font-semibold rounded transition shadow-xs"
            >
              <Settings className="w-3.5 h-3.5" />
              Configurações
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total de Utilizadores"
          value={userCount}
          supporting="Colaboradores, Gestores e IT"
          icon={Users}
        />
        <StatCard
          label="Departamentos Ativos"
          value={deptCount}
          supporting="Unidades orgânicas configuradas"
          icon={Building2}
        />
        <StatCard
          label="Aprovações Pendentes"
          value={pendingApprovalsCount}
          supporting={pendingApprovalsCount > 0 ? 'Submissões a aguardar parecer' : 'Nenhuma pendente'}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Estado do Sistema"
          value="OPERACIONAL"
          badge={
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
              OK
            </span>
          }
          supporting="API, PostgreSQL e Auth"
          icon={Activity}
        />
      </div>

      {/* Main Administrative Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1F2937]">Utilizadores Registados</h2>
              <p className="text-xs text-[#64748B]">Contas com acesso à plataforma</p>
            </div>
            <button
              onClick={() => navigate('/users')}
              className="text-xs font-semibold text-[#1F5FAD] hover:underline flex items-center gap-1"
            >
              Ver todos
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentProfiles.map((p) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatar name={p.full_name} size="sm" />
                  <div>
                    <div className="text-xs font-semibold text-slate-800">{p.full_name}</div>
                    <div className="text-[11px] text-slate-500">{p.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                    {p.roles?.[0]?.code || 'COLABORADOR'}
                  </span>
                  <StatusBadge status={p.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Log Stream */}
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1F2937]">Trilho de Auditoria Recente</h2>
              <p className="text-xs text-[#64748B]">Registos institucionais e operacionais</p>
            </div>
            <button
              onClick={() => navigate('/audit')}
              className="text-xs font-semibold text-[#1F5FAD] hover:underline flex items-center gap-1"
            >
              Ver auditoria
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentAudits.map((a) => (
              <div key={a.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="min-w-0 pr-3">
                  <div className="font-mono text-[11px] text-[#1F5FAD] font-semibold">{a.action}</div>
                  <div className="text-slate-600 truncate text-[11px] mt-0.5">{a.description}</div>
                </div>
                <div className="text-right shrink-0 text-[11px] text-slate-400">
                  {new Date(a.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
