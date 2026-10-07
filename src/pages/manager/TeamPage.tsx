import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Mail, Phone, Calendar, Clock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService, formatMinutesToHours } from '../../services/dataService';
import { Profile, Timesheet } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';

export const TeamPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [teamTimesheets, setTeamTimesheets] = useState<Timesheet[]>([]);

  useEffect(() => {
    if (currentUser) {
      const allProfiles = dataService.getProfiles();
      const myTeam = allProfiles.filter(
        (p) => p.department_id === currentUser.department_id && p.id !== currentUser.id
      );
      setTeamMembers(myTeam);

      const allTs = dataService.getTimesheets(currentUser);
      setTeamTimesheets(allTs);
    }
  }, [currentUser]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha Equipa"
        subtitle={`Colaboradores alocados ao departamento de ${currentUser?.department?.name || 'Operações'}.`}
      />

      {teamMembers.length === 0 ? (
        <EmptyState
          title="Nenhum colaborador alocado"
          message="Não existem colaboradores registados sob o seu departamento de momento."
          icon={Users}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teamMembers.map((member) => {
            const memberTs = teamTimesheets.filter((t) => t.employee_id === member.id);
            const currentPeriodTs = memberTs.find((t) => t.period_start === '2026-10-01') || memberTs[0];

            return (
              <div
                key={member.id}
                className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5 flex flex-col justify-between hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={member.full_name} size="md" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">{member.full_name}</h3>
                        <p className="text-xs text-[#1F5FAD] font-medium">
                          {member.job_title || 'Técnico Operacional'}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={member.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3 mb-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Mail className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{member.email}</span>
                    </div>
                    {member.phone && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <Phone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span>{member.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="font-semibold text-slate-700">Nº de Colaborador:</span>
                      <span>{member.employee_number || 'SIH-0000'}</span>
                    </div>
                  </div>

                  {/* Current Timesheet Status */}
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-500 font-medium">Timesheet em Curso:</span>
                      {currentPeriodTs ? (
                        <StatusBadge status={currentPeriodTs.status} size="sm" />
                      ) : (
                        <span className="text-slate-400">Sem registo</span>
                      )}
                    </div>
                    {currentPeriodTs && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>Horas Apuradas:</span>
                        <span className="font-bold text-[#1F5FAD]">
                          {formatMinutesToHours(currentPeriodTs.total_minutes || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => {
                      if (currentPeriodTs) {
                        navigate(`/timesheets/${currentPeriodTs.id}`);
                      } else {
                        navigate('/approvals');
                      }
                    }}
                    className="w-full py-1.5 px-3 text-xs font-semibold text-[#1F5FAD] hover:bg-slate-50 rounded transition flex items-center justify-center gap-1.5"
                  >
                    <span>Inspecionar Folha de Ponto</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
