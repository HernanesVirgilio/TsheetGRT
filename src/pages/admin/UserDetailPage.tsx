import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Shield,
  Calendar,
  Clock,
  Edit2,
  UserCheck,
  UserX,
  FileClock,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService, formatMinutesToHours } from '../../services/dataService';
import { Profile, Timesheet, AuditEvent, RoleCode } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export const UserDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentUser, role: currentRole } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [userTimesheets, setUserTimesheets] = useState<Timesheet[]>([]);
  const [userAudits, setUserAudits] = useState<AuditEvent[]>([]);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);

  const loadData = () => {
    if (!id) return;
    const p = dataService.getProfileById(id);
    if (!p) {
      navigate('/users');
      return;
    }
    setProfile(p);

    if (currentUser) {
      // Load this user's timesheets
      const allTs = dataService.getTimesheets(currentUser);
      setUserTimesheets(allTs.filter((t) => t.employee_id === id));

      // Load audit events for this user
      const audits = dataService.getAuditEvents(1, 20, undefined, p.email);
      setUserAudits(audits.items);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, currentUser]);

  if (!profile) return null;

  const handleToggleStatus = () => {
    if (!currentUser) return;
    try {
      dataService.toggleUserStatus(profile.id, !profile.is_active, currentUser.id);
      setStatusConfirmOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar estado do utilizador');
    }
  };

  const canManage = currentRole === 'ADMIN';

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate('/users')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar à lista de utilizadores
        </button>
      </div>

      <PageHeader
        title={profile.full_name}
        subtitle={`Nº de Colaborador: ${profile.employee_number || 'SIH'} · ${profile.job_title || 'Colaborador'}`}
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <StatusBadge status={profile.is_active ? 'ACTIVE' : 'INACTIVE'} />
              <button
                onClick={() => setStatusConfirmOpen(true)}
                className={`px-3 py-1.5 text-xs font-semibold rounded border transition flex items-center gap-1.5 ${
                  profile.is_active
                    ? 'border-red-200 text-[#C0392B] hover:bg-red-50'
                    : 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                {profile.is_active ? (
                  <>
                    <UserX className="w-3.5 h-3.5" />
                    Desativar Conta
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    Ativar Conta
                  </>
                )}
              </button>
            </div>
          )
        }
      />

      {/* User Information Card */}
      <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-slate-100">
          <UserAvatar name={profile.full_name} size="lg" />
          <div>
            <h2 className="text-base font-bold text-slate-800">{profile.full_name}</h2>
            <p className="text-xs text-slate-500">{profile.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 rounded bg-blue-50 text-[#1F5FAD] border border-blue-100 font-semibold text-[11px]">
                Role: {profile.roles?.[0]?.code || 'COLABORADOR'}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-600 font-medium">
                {profile.department?.name || 'Sem departamento'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
          <div>
            <span className="text-slate-500 font-medium block">Telefone:</span>
            <span className="font-semibold text-slate-800">{profile.phone || 'Não registado'}</span>
          </div>
          <div>
            <span className="text-slate-500 font-medium block">Data de Criação:</span>
            <span className="font-semibold text-slate-800">
              {new Date(profile.created_at).toLocaleDateString('pt-PT')}
            </span>
          </div>
          <div>
            <span className="text-slate-500 font-medium block">Último Acesso:</span>
            <span className="font-semibold text-slate-800">
              {profile.last_login_at
                ? new Date(profile.last_login_at).toLocaleString('pt-PT')
                : 'Nunca acedeu'}
            </span>
          </div>
        </div>
      </div>

      {/* User's Timesheet History */}
      <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1F2937]">Histórico de Folhas de Ponto</h3>
            <p className="text-xs text-[#64748B]">Timesheets registados por este colaborador</p>
          </div>
          <span className="text-xs text-slate-500">{userTimesheets.length} períodos</span>
        </div>

        {userTimesheets.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Nenhum timesheet registado para este utilizador.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Período</th>
                  <th className="py-2.5 px-4">Horas Totais</th>
                  <th className="py-2.5 px-4">Lançamentos</th>
                  <th className="py-2.5 px-4">Estado</th>
                  <th className="py-2.5 px-4">Submetido</th>
                  <th className="py-2.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userTimesheets.map((ts) => (
                  <tr key={ts.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      {ts.period_start} a {ts.period_end}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-[#1F5FAD]">
                      {formatMinutesToHours(ts.total_minutes || 0)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {ts.entries?.length || 0}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={ts.status} size="sm" />
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {ts.submitted_at ? new Date(ts.submitted_at).toLocaleDateString('pt-PT') : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => navigate(`/timesheets/${ts.id}`)}
                        className="text-xs font-semibold text-[#1F5FAD] hover:underline"
                      >
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Toggle Status */}
      <ConfirmDialog
        isOpen={statusConfirmOpen}
        title={profile.is_active ? 'Desativar este utilizador?' : 'Ativar este utilizador?'}
        message={
          profile.is_active
            ? `O utilizador ${profile.full_name} deixará de conseguir iniciar sessão na plataforma.`
            : `O utilizador ${profile.full_name} recuperará o acesso ao sistema.`
        }
        confirmLabel={profile.is_active ? 'Desativar' : 'Ativar'}
        variant={profile.is_active ? 'danger' : 'primary'}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusConfirmOpen(false)}
      />
    </div>
  );
};
