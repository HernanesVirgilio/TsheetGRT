import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck,
  Users,
  AlertCircle,
  ArrowRight,
  Building,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService, formatMinutesToHours } from '../../services/dataService';
import { Timesheet, Profile } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';

export const ManagerDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [teamTimesheets, setTeamTimesheets] = useState<Timesheet[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);

  useEffect(() => {
    if (currentUser) {
      const allTs = dataService.getTimesheets(currentUser);
      setTeamTimesheets(allTs);

      const allProfiles = dataService.getProfiles();
      const departmentMembers = allProfiles.filter(
        (p) => p.department_id === currentUser.department_id && p.id !== currentUser.id
      );
      setTeamMembers(departmentMembers);
    }
  }, [currentUser]);

  // Pending approvals
  const pendingApprovals = teamTimesheets.filter(
    (t) => t.status === 'SUBMITTED' && t.employee_id !== currentUser?.id
  );

  // Missing or draft submissions
  const draftTimesheets = teamTimesheets.filter((t) => t.status === 'DRAFT');

  // Total team hours in current periods
  const totalTeamMinutes = teamTimesheets.reduce((acc, t) => acc + (t.total_minutes || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard da Equipa"
        subtitle="Acompanhe o estado operacional, validação de horas e aprovações da sua equipa."
        actions={
          <button
            onClick={() => navigate('/approvals')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-sm font-semibold rounded shadow-xs transition"
          >
            <ClipboardCheck className="w-4 h-4" />
            Rever aprovações ({pendingApprovals.length})
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Aprovações Pendentes"
          value={pendingApprovals.length}
          badge={
            pendingApprovals.length > 0 ? (
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">
                Ação necessária
              </span>
            ) : undefined
          }
          supporting={pendingApprovals.length === 0 ? 'Sem submissões pendentes' : 'Submissões aguardando revisão'}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Membros na Equipa"
          value={teamMembers.length}
          supporting={`Departamento: ${currentUser?.department?.name || 'Operações'}`}
          icon={Users}
        />
        <StatCard
          label="Horas Consolidadas"
          value={formatMinutesToHours(totalTeamMinutes)}
          supporting="Total de horas registadas no ciclo"
          icon={UserCheck}
        />
        <StatCard
          label="Submissões em Rascunho"
          value={draftTimesheets.length}
          supporting="Folhas de ponto ainda abertas"
          icon={Building}
        />
      </div>

      {/* Two columns: Pending Approvals list & Team Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Approvals priority table */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#1F2937]">Aprovações que Requerem Atenção</h2>
              <p className="text-xs text-[#64748B]">Timesheets submetidos por colaboradores da sua equipa</p>
            </div>
            <button
              onClick={() => navigate('/approvals')}
              className="text-xs font-semibold text-[#1F5FAD] hover:underline flex items-center gap-1"
            >
              Ver todas
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded border border-dashed border-slate-200">
              <ClipboardCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Todas as aprovações estão em dia</p>
              <p className="text-slate-500 mt-1">Não existem submissões de timesheet pendentes de validação neste momento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                    <th className="py-2.5 px-3 font-semibold">Colaborador</th>
                    <th className="py-2.5 px-3 font-semibold">Período</th>
                    <th className="py-2.5 px-3 font-semibold">Total Horas</th>
                    <th className="py-2.5 px-3 font-semibold">Data Submissão</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingApprovals.map((ts) => (
                    <tr key={ts.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={ts.employee?.full_name || 'Colaborador'} size="sm" />
                          <div>
                            <div className="font-semibold text-slate-800">
                              {ts.employee?.full_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {ts.employee?.employee_number}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                        {ts.period_start} a {ts.period_end}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#1F5FAD] whitespace-nowrap">
                        {formatMinutesToHours(ts.total_minutes || 0)}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {ts.submitted_at ? new Date(ts.submitted_at).toLocaleDateString('pt-PT') : 'Hoje'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => navigate('/approvals')}
                          className="px-2.5 py-1 bg-[#1F5FAD] hover:bg-[#184d8f] text-white font-medium rounded text-xs transition"
                        >
                          Rever
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Team Members List */}
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h3 className="text-sm font-bold text-[#1F2937]">Membros da Equipa</h3>
            <span className="text-xs text-slate-500">{teamMembers.length} pessoas</span>
          </div>

          <div className="space-y-3">
            {teamMembers.map((member) => {
              const memberTs = teamTimesheets.find((t) => t.employee_id === member.id && t.period_start === '2026-10-01');
              return (
                <div
                  key={member.id}
                  className="p-2.5 rounded border border-slate-100 hover:border-slate-300 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar name={member.full_name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">
                        {member.full_name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {member.job_title || 'Técnico Operacional'}
                      </div>
                    </div>
                  </div>
                  <div>
                    {memberTs ? (
                      <StatusBadge status={memberTs.status} size="sm" />
                    ) : (
                      <span className="text-[11px] text-slate-400">Sem registo</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => navigate('/team')}
              className="w-full py-1.5 text-xs text-[#1F5FAD] font-semibold hover:bg-slate-50 rounded transition text-center"
            >
              Consultar detalhes da equipa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
