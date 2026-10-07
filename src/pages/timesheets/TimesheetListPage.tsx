import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock3,
  Plus,
  Calendar,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService, formatMinutesToHours } from '../../services/dataService';
import { Timesheet, TimesheetStatus } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { UserAvatar } from '../../components/ui/UserAvatar';

export const TimesheetListPage: React.FC = () => {
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [newPeriodModalOpen, setNewPeriodModalOpen] = useState(false);
  const [newStartDate, setNewStartDate] = useState('2026-11-01');
  const [newEndDate, setNewEndDate] = useState('2026-11-30');

  const loadTimesheets = () => {
    if (currentUser) {
      const list = dataService.getTimesheets(currentUser);
      setTimesheets(list);
    }
  };

  useEffect(() => {
    loadTimesheets();
  }, [currentUser]);

  const handleCreatePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const created = dataService.createTimesheet(currentUser.id, newStartDate, newEndDate);
      setNewPeriodModalOpen(false);
      navigate(`/timesheets/${created.id}`);
    } catch (err: any) {
      alert(err.message || 'Erro ao criar período');
    }
  };

  const filtered = timesheets.filter((t) => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={role === 'ADMIN' ? 'Gestão Geral de Timesheets' : 'Meu Timesheet'}
        subtitle="Registo de presença, períodos de apuração e estado de validação de horas."
        actions={
          <button
            onClick={() => setNewPeriodModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-sm font-semibold rounded shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            Novo Período de Horas
          </button>
        }
      />

      {/* Filters bar */}
      <div className="bg-white p-4 rounded-lg border border-[#D9E0E7] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-700">Filtrar por Estado:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-[#D9E0E7] rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1F5FAD]"
          >
            <option value="ALL">Todos os estados</option>
            <option value="DRAFT">Rascunho</option>
            <option value="SUBMITTED">Submetido</option>
            <option value="APPROVED">Aprovado</option>
            <option value="REJECTED">Rejeitado</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          A exibir <strong>{filtered.length}</strong> de <strong>{timesheets.length}</strong> períodos
        </div>
      </div>

      {/* Timesheet List Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Não existem timesheets neste período"
          message="Crie um novo período de registo de ponto para começar a lançar horas."
          icon={Clock3}
          action={
            <button
              onClick={() => setNewPeriodModalOpen(true)}
              className="px-3 py-1.5 bg-[#1F5FAD] text-white text-xs font-semibold rounded hover:bg-[#184d8f]"
            >
              Criar Período
            </button>
          }
        />
      ) : (
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                  {role === 'ADMIN' && <th className="py-3 px-4">Colaborador</th>}
                  <th className="py-3 px-4">Período de Apuração</th>
                  <th className="py-3 px-4">Horas Totais</th>
                  <th className="py-3 px-4">Registos</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Data de Submissão</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((ts) => (
                  <tr
                    key={ts.id}
                    onClick={() => navigate(`/timesheets/${ts.id}`)}
                    className="hover:bg-slate-50/80 cursor-pointer transition"
                  >
                    {role === 'ADMIN' && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={ts.employee?.full_name || 'Utilizador'} size="sm" />
                          <span className="font-semibold text-slate-800">
                            {ts.employee?.full_name}
                          </span>
                        </div>
                      </td>
                    )}
                    <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>{ts.period_start} até {ts.period_end}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-[#1F5FAD] whitespace-nowrap">
                      {formatMinutesToHours(ts.total_minutes || 0)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {ts.entries?.length || 0} lançamentos
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={ts.status} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {ts.submitted_at
                        ? new Date(ts.submitted_at).toLocaleDateString('pt-PT')
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1F5FAD] hover:underline">
                        Abrir
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal to create a new reporting period */}
      {newPeriodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-[#1F2937] mb-1">
              Criar Novo Período de Timesheet
            </h3>
            <p className="text-xs text-[#64748B] mb-4">
              Indique o intervalo de datas do ciclo de trabalho.
            </p>

            <form onSubmit={handleCreatePeriod} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data de Início
                </label>
                <input
                  type="date"
                  required
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data de Fim
                </label>
                <input
                  type="date"
                  required
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D9E0E7] rounded bg-white"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNewPeriodModalOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] rounded"
                >
                  Criar e Abrir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
