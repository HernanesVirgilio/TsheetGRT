import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock3,
  CalendarCheck2,
  FileCheck2,
  AlertCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  Send,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService, formatMinutesToHours } from '../../services/dataService';
import { Timesheet, TimesheetEntry } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { StatusBadge } from '../../components/ui/StatusBadge';

export const EmployeeDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [currentTimesheet, setCurrentTimesheet] = useState<Timesheet | null>(null);

  useEffect(() => {
    if (currentUser) {
      const list = dataService.getTimesheets(currentUser);
      setTimesheets(list);
      // Find current draft or latest
      const active = list.find((t) => t.status === 'DRAFT') || list[0] || null;
      setCurrentTimesheet(active);
    }
  }, [currentUser]);

  // Today's entries
  const todayStr = '2026-10-07'; // current simulation date
  const todayEntries = currentTimesheet?.entries?.filter((e) => e.work_date === todayStr) || [];
  const todayMinutes = todayEntries.reduce((acc, curr) => acc + curr.total_minutes, 0);

  // Month total hours
  const monthMinutes = currentTimesheet?.total_minutes || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Tenha uma visão rápida das suas horas, tarefas e estado de submissão."
        actions={
          <button
            onClick={() => navigate('/timesheets')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-sm font-semibold rounded shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            Registar horas
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Horas Hoje"
          value={formatMinutesToHours(todayMinutes)}
          supporting={todayMinutes >= 480 ? 'Objetivo diário (8h) cumprido' : `${formatMinutesToHours(Math.max(0, 480 - todayMinutes))} restantes para 8h`}
          icon={Clock3}
        />
        <StatCard
          label="Horas no Mês Atual"
          value={formatMinutesToHours(monthMinutes)}
          supporting="Período: Outubro de 2026"
          icon={TrendingUp}
        />
        <StatCard
          label="Estado do Timesheet"
          value={currentTimesheet?.status || 'Sem registo'}
          badge={currentTimesheet ? <StatusBadge status={currentTimesheet.status} size="sm" /> : undefined}
          supporting={currentTimesheet?.status === 'DRAFT' ? 'Pode registar e editar livremente' : 'Aguardando validação'}
          icon={FileCheck2}
        />
        <StatCard
          label="Dias Registados"
          value={currentTimesheet?.entries?.length ? new Set(currentTimesheet.entries.map(e => e.work_date)).size : 0}
          supporting="Total de dias com registo"
          icon={CalendarCheck2}
        />
      </div>

      {/* Operational Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Timesheet Status Box */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#1F2937]">Timesheet Atual</h2>
              <p className="text-xs text-[#64748B]">Período de trabalho em curso</p>
            </div>
            {currentTimesheet && (
              <StatusBadge status={currentTimesheet.status} />
            )}
          </div>

          {currentTimesheet ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 bg-slate-50 rounded border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Período de Apuração:</span>
                  <span className="font-semibold text-slate-800">
                    {currentTimesheet.period_start} a {currentTimesheet.period_end}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Horas Acumuladas:</span>
                  <span className="font-bold text-[#1F5FAD] text-sm">
                    {formatMinutesToHours(currentTimesheet.total_minutes || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Registos Lançados:</span>
                  <span className="font-semibold text-slate-800">
                    {currentTimesheet.entries?.length || 0} lançamentos
                  </span>
                </div>
              </div>

              {/* Status explanation */}
              {currentTimesheet.status === 'REJECTED' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#C0392B] shrink-0 mt-0.5" />
                  <div>
                    <strong>Atenção:</strong> O seu gestor solicitou correções:{' '}
                    <em>"{currentTimesheet.rejection_reason}"</em>. Corrija os registos e volte a submeter.
                  </div>
                </div>
              )}

              {/* Recent Entries Table */}
              <div>
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Últimos Registos de Atividade
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                        <th className="py-2 px-3 font-semibold">Data</th>
                        <th className="py-2 px-3 font-semibold">Atividade</th>
                        <th className="py-2 px-3 font-semibold">Horário</th>
                        <th className="py-2 px-3 font-semibold">Duração</th>
                        <th className="py-2 px-3 font-semibold">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentTimesheet.entries && currentTimesheet.entries.length > 0 ? (
                        currentTimesheet.entries.slice(-5).map((entry: TimesheetEntry) => (
                          <tr key={entry.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">
                              {entry.work_date}
                            </td>
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                              {entry.activity?.name || 'Operacional'}
                            </td>
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                              {entry.start_time} - {entry.end_time}
                            </td>
                            <td className="py-2 px-3 font-semibold text-[#1F5FAD] whitespace-nowrap">
                              {formatMinutesToHours(entry.total_minutes)}
                            </td>
                            <td className="py-2 px-3 text-slate-600 truncate max-w-xs">
                              {entry.description}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">
                            Nenhum registo efetuado neste período ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <button
                  onClick={() => navigate('/timesheets')}
                  className="text-xs text-[#1F5FAD] font-semibold hover:underline flex items-center gap-1"
                >
                  Abrir editor completo de timesheet
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                {currentTimesheet.status === 'DRAFT' && (
                  <button
                    onClick={() => navigate('/timesheets')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-amber-600 text-white hover:bg-amber-700 transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submeter para Aprovação
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              Não existe nenhum timesheet ativo. Clique em "Registar horas" para iniciar.
            </div>
          )}
        </div>

        {/* Timesheet History & Instructions */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5">
            <h3 className="text-sm font-bold text-[#1F2937] mb-3 pb-2 border-b border-slate-100">
              Histórico Recente
            </h3>
            <div className="space-y-3">
              {timesheets.map((ts) => (
                <div
                  key={ts.id}
                  onClick={() => navigate('/timesheets')}
                  className="p-3 rounded border border-slate-200 hover:border-[#1F5FAD] cursor-pointer transition flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800">
                      {ts.period_start} a {ts.period_end}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Total: {formatMinutesToHours(ts.total_minutes || 0)}
                    </div>
                  </div>
                  <StatusBadge status={ts.status} size="sm" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-xs text-slate-600 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <CalendarCheck2 className="w-4 h-4 text-[#1F5FAD]" />
              Regulamento de Ponto SI Holdings
            </div>
            <p className="leading-relaxed text-[11px]">
              • Registos diários recomendados: 08:00 às 17:00 com 60 min de pausa de almoço (8h úteis).
            </p>
            <p className="leading-relaxed text-[11px]">
              • O timesheet mensal deve ser submetido até ao 1º dia útil do mês subsequente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
