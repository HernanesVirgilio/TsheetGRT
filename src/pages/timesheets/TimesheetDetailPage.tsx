import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock3,
  Plus,
  Send,
  Edit2,
  Trash2,
  AlertCircle,
  Calendar,
  Building,
  CheckCircle2,
  Printer,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import {
  dataService,
  formatMinutesToHours,
  calculateMinutesBetween,
} from '../../services/dataService';
import { Timesheet, TimesheetEntry, Activity } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';

export const TimesheetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();

  const [timesheet, setTimesheet] = useState<Timesheet | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);

  // Form State
  const [workDate, setWorkDate] = useState('2026-10-07');
  const [activityId, setActivityId] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  // Submit confirmation dialog
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);

  const loadData = () => {
    if (currentUser && id) {
      try {
        const ts = dataService.getTimesheetById(id, currentUser);
        setTimesheet(ts);
        const acts = dataService.getActivities();
        setActivities(acts);
        if (acts.length > 0 && !activityId) {
          setActivityId(acts[0].id);
        }
      } catch (e: any) {
        alert(e.message || 'Erro ao carregar timesheet');
        navigate('/timesheets');
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [id, currentUser]);

  if (!timesheet) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        A carregar folha de horas...
      </div>
    );
  }

  const isEditable =
    (timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED') &&
    (timesheet.employee_id === currentUser?.id || role === 'ADMIN');

  const calculatedMinutes = calculateMinutesBetween(startTime, endTime, breakMinutes);

  const handleOpenNewEntry = () => {
    setEditingEntry(null);
    setWorkDate(timesheet.period_start);
    setStartTime('08:00');
    setEndTime('17:00');
    setBreakMinutes(60);
    setDescription('');
    setFormError('');
    setEntryModalOpen(true);
  };

  const handleOpenEditEntry = (entry: TimesheetEntry) => {
    setEditingEntry(entry);
    setWorkDate(entry.work_date);
    setActivityId(entry.activity_id);
    setStartTime(entry.start_time);
    setEndTime(entry.end_time);
    setBreakMinutes(entry.break_minutes);
    setDescription(entry.description);
    setFormError('');
    setEntryModalOpen(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!workDate || !activityId || !startTime || !endTime || !description.trim()) {
      setFormError('Por favor preencha todos os campos obrigatórios.');
      return;
    }

    if (endTime <= startTime) {
      setFormError('A hora de saída deve ser posterior à hora de entrada.');
      return;
    }

    if (breakMinutes < 0) {
      setFormError('A pausa não pode ser um valor negativo.');
      return;
    }

    if (calculatedMinutes <= 0) {
      setFormError('O tempo de trabalho efetivo após a pausa tem de ser superior a zero.');
      return;
    }

    try {
      dataService.saveTimesheetEntry({
        id: editingEntry?.id,
        timesheet_id: timesheet.id,
        employee_id: timesheet.employee_id,
        work_date: workDate,
        activity_id: activityId,
        start_time: startTime,
        end_time: endTime,
        break_minutes: breakMinutes,
        description: description.trim(),
      });

      setEntryModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao guardar registo');
    }
  };

  const handleDeleteEntry = (entryId: string) => {
    if (!currentUser) return;
    try {
      dataService.deleteTimesheetEntry(entryId, currentUser.id);
      setDeleteConfirmId(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao eliminar registo');
    }
  };

  const handleSubmitTimesheet = () => {
    if (!currentUser) return;
    setIsSubmittingAction(true);
    try {
      dataService.submitTimesheet(timesheet.id, currentUser.id);
      setSubmitConfirmOpen(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao submeter timesheet');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/timesheets')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar à listagem de timesheets
        </button>
      </div>

      <PageHeader
        title={`Timesheet: ${timesheet.period_start} a ${timesheet.period_end}`}
        subtitle={`Colaborador: ${timesheet.employee?.full_name || 'Utilizador'} · Nº: ${timesheet.employee?.employee_number || 'SIH'}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={timesheet.status} />

            <button
              onClick={() => setPrintPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#D9E0E7] text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded transition"
              title="Gerar comprovativo formal para impressão"
            >
              <Printer className="w-3.5 h-3.5 text-[#1F5FAD]" />
              Comprovativo
            </button>

            {isEditable && (
              <>
                <button
                  onClick={handleOpenNewEntry}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-[#D9E0E7] text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Registo
                </button>

                <button
                  onClick={() => setSubmitConfirmOpen(true)}
                  disabled={!timesheet.entries || timesheet.entries.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-xs font-semibold rounded transition disabled:opacity-50 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submeter Timesheet
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Warning/Alert for Rejection */}
      {timesheet.status === 'REJECTED' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#C0392B] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-sm block mb-1">Timesheet devolvido para retificação</span>
            <p className="leading-relaxed">
              <strong>Motivo apontado pelo gestor:</strong> "{timesheet.rejection_reason}"
            </p>
            <p className="mt-1 text-[11px] text-red-700">
              Pode editar ou adicionar novos lançamentos e submeter novamente quando estiver em conformidade.
            </p>
          </div>
        </div>
      )}

      {/* Read-only banner if submitted or approved */}
      {timesheet.status === 'SUBMITTED' && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2.5">
          <Clock3 className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Este timesheet foi submetido em <strong>{new Date(timesheet.submitted_at!).toLocaleDateString('pt-PT')}</strong> e aguarda parecer e validação do gestor da equipa. A edição encontra-se bloqueada.
          </span>
        </div>
      )}

      {timesheet.status === 'APPROVED' && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Este timesheet foi formalmente aprovado em <strong>{new Date(timesheet.approved_at!).toLocaleDateString('pt-PT')}</strong> por <strong>{timesheet.approver?.full_name || 'Gestor'}</strong>. Registos consolidados.
          </span>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-lg border border-[#D9E0E7] shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total de Horas
          </span>
          <span className="text-2xl font-bold text-[#1F5FAD]">
            {formatMinutesToHours(timesheet.total_minutes || 0)}
          </span>
        </div>

        <div className="p-4 bg-white rounded-lg border border-[#D9E0E7] shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Dias com Lançamentos
          </span>
          <span className="text-2xl font-bold text-slate-800">
            {timesheet.entries ? new Set(timesheet.entries.map((e) => e.work_date)).size : 0} dias
          </span>
        </div>

        <div className="p-4 bg-white rounded-lg border border-[#D9E0E7] shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Média Diária Registada
          </span>
          <span className="text-2xl font-bold text-slate-800">
            {timesheet.entries && timesheet.entries.length > 0
              ? formatMinutesToHours(
                  Math.round(
                    (timesheet.total_minutes || 0) /
                      Math.max(1, new Set(timesheet.entries.map((e) => e.work_date)).size)
                  )
                )
              : '0h 00m'}
          </span>
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1F2937]">Registos de Horas do Período</h3>
            <p className="text-xs text-[#64748B]">Lançamentos diários detalhados por atividade</p>
          </div>
          {isEditable && (
            <button
              onClick={handleOpenNewEntry}
              className="text-xs font-semibold text-[#1F5FAD] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo lançamento
            </button>
          )}
        </div>

        {!timesheet.entries || timesheet.entries.length === 0 ? (
          <EmptyState
            title="Não existem registos de horas neste timesheet"
            message="Registe as horas de trabalho diárias para cumprir o ciclo de apuração."
            icon={Clock3}
            action={
              isEditable ? (
                <button
                  onClick={handleOpenNewEntry}
                  className="px-3 py-1.5 bg-[#1F5FAD] text-white text-xs font-semibold rounded hover:bg-[#184d8f]"
                >
                  Adicionar Primeiro Registo
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Atividade / Projeto</th>
                  <th className="py-3 px-4">Entrada - Saída</th>
                  <th className="py-3 px-4">Pausa</th>
                  <th className="py-3 px-4">Duração Útil</th>
                  <th className="py-3 px-4">Descrição das Tarefas</th>
                  {isEditable && <th className="py-3 px-4 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {timesheet.entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      {entry.work_date}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {entry.activity?.name || 'Operacional'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap font-mono">
                      {entry.start_time} — {entry.end_time}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {entry.break_minutes} min
                    </td>
                    <td className="py-3 px-4 font-bold text-[#1F5FAD] whitespace-nowrap">
                      {formatMinutesToHours(entry.total_minutes)}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-md">
                      {entry.description}
                    </td>
                    {isEditable && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditEntry(entry)}
                            className="p-1.5 text-slate-400 hover:text-[#1F5FAD] rounded hover:bg-slate-100"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(entry.id)}
                            className="p-1.5 text-slate-400 hover:text-[#C0392B] rounded hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit Entry */}
      {entryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-lg w-full p-6">
            <h3 className="text-base font-bold text-[#1F2937] mb-1">
              {editingEntry ? 'Editar Registo de Horas' : 'Novo Registo de Horas'}
            </h3>
            <p className="text-xs text-[#64748B] mb-4">
              Indique os horários de início e fim, pausa de almoço e descrição sumária das tarefas realizadas.
            </p>

            {formError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-xs text-[#C0392B] rounded flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEntry} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data de Trabalho</label>
                  <input
                    type="date"
                    required
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Atividade / Projeto</label>
                  <select
                    value={activityId}
                    onChange={(e) => setActivityId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
                  >
                    {activities.map((act) => (
                      <option key={act.id} value={act.id}>
                        {act.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hora de Início</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hora de Fim</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pausa (minutos)</label>
                  <input
                    type="number"
                    min={0}
                    step={15}
                    required
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white font-mono"
                  />
                </div>
              </div>

              {/* Dynamic preview of calculated minutes */}
              <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                <span className="text-slate-600 font-medium">Tempo de trabalho útil calculado:</span>
                <span className="text-sm font-bold text-[#1F5FAD]">
                  {formatMinutesToHours(calculatedMinutes)}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição das Tarefas</label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva as tarefas e operações executadas neste dia..."
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEntryModalOpen(false)}
                  className="px-3 py-2 font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] rounded"
                >
                  Guardar Registo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Confirmation Dialog */}
      <ConfirmDialog
        isOpen={submitConfirmOpen}
        title="Submeter Timesheet para Aprovação?"
        message={`Confirma a submissão formal de ${formatMinutesToHours(timesheet.total_minutes || 0)} referentes ao período de ${timesheet.period_start} a ${timesheet.period_end}? Após a submissão, a folha ficará bloqueada para análise pelo seu gestor.`}
        confirmLabel="Submeter para Gestor"
        variant="primary"
        isLoading={isSubmittingAction}
        onConfirm={handleSubmitTimesheet}
        onCancel={() => setSubmitConfirmOpen(false)}
      />

      {/* Delete entry confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmId)}
        title="Eliminar este registo de horas?"
        message="Esta ação irá remover permanentemente este lançamento diário da folha de ponto."
        confirmLabel="Eliminar Registo"
        variant="danger"
        onConfirm={() => deleteConfirmId && handleDeleteEntry(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {/* Institutional Printable Statement Modal */}
      {printPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
          <div className="bg-white rounded-lg shadow-2xl border border-[#D9E0E7] max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-[#1F5FAD]" />
                <h3 className="text-sm font-bold text-slate-800">
                  Comprovativo Oficial de Folha de Ponto · SI Holdings
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-[#1F5FAD] hover:bg-[#184d8f] text-white font-semibold rounded text-xs transition flex items-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Documento
                </button>
                <button
                  onClick={() => setPrintPreviewOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-xs custom-scrollbar">
              {/* Document Header */}
              <div className="flex items-start justify-between border-b-2 border-[#1F5FAD] pb-4">
                <div>
                  <div className="text-base font-bold text-[#12304A] tracking-wider uppercase">
                    SI HOLDINGS
                  </div>
                  <div className="text-xs font-semibold text-[#1F5FAD]">
                    REGISTO INSTITUCIONAL DE OPERAÇÕES & TIMESHEET
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Maputo · Moçambique · Sistema Interno Homologado
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-[11px] text-slate-400 block">ID: {timesheet.id}</span>
                  <div className="mt-1">
                    <StatusBadge status={timesheet.status} size="sm" />
                  </div>
                </div>
              </div>

              {/* Colaborador Metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[11px]">Colaborador:</span>
                  <span className="font-bold text-slate-800 text-xs">{timesheet.employee?.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Nº de Colaborador:</span>
                  <span className="font-semibold text-slate-800">{timesheet.employee?.employee_number || 'SIH'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Departamento:</span>
                  <span className="font-semibold text-slate-800">{timesheet.employee?.department?.name || 'Geral'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Período de Apuração:</span>
                  <span className="font-semibold text-slate-800">{timesheet.period_start} a {timesheet.period_end}</span>
                </div>
              </div>

              {/* Entries Summary Table */}
              <div>
                <table className="w-full text-left text-xs border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="p-2 border-r border-slate-200">Data</th>
                      <th className="p-2 border-r border-slate-200">Atividade</th>
                      <th className="p-2 border-r border-slate-200">Horário</th>
                      <th className="p-2 border-r border-slate-200">Pausa</th>
                      <th className="p-2 border-r border-slate-200">Horas</th>
                      <th className="p-2">Descrição</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {timesheet.entries?.map((entry) => (
                      <tr key={entry.id}>
                        <td className="p-2 font-medium border-r border-slate-200">{entry.work_date}</td>
                        <td className="p-2 border-r border-slate-200">{entry.activity?.name || 'Operacional'}</td>
                        <td className="p-2 font-mono border-r border-slate-200">{entry.start_time} - {entry.end_time}</td>
                        <td className="p-2 border-r border-slate-200">{entry.break_minutes}m</td>
                        <td className="p-2 font-bold text-[#1F5FAD] border-r border-slate-200">{formatMinutesToHours(entry.total_minutes)}</td>
                        <td className="p-2 text-slate-600">{entry.description}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t border-slate-200">
                      <td colSpan={4} className="p-2 text-right border-r border-slate-200">
                        TOTAL DE HORAS HOMOLOGADAS:
                      </td>
                      <td className="p-2 text-[#1F5FAD] text-sm border-r border-slate-200">
                        {formatMinutesToHours(timesheet.total_minutes || 0)}
                      </td>
                      <td className="p-2 text-slate-400 font-normal">
                        {timesheet.entries?.length || 0} lançamentos
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures & Certification Block */}
              <div className="pt-8 grid grid-cols-2 gap-12 border-t border-slate-200 mt-8">
                <div className="text-center">
                  <div className="border-b border-slate-400 pb-1 mb-2">
                    <span className="text-slate-700 font-medium">{timesheet.employee?.full_name}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block">
                    Assinatura do Colaborador
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {timesheet.submitted_at ? `Submetido em ${new Date(timesheet.submitted_at).toLocaleDateString('pt-PT')}` : 'Pendente de assinatura'}
                  </span>
                </div>

                <div className="text-center">
                  <div className="border-b border-slate-400 pb-1 mb-2">
                    <span className="text-slate-700 font-medium">
                      {timesheet.approver?.full_name || (timesheet.status === 'APPROVED' ? 'Gestão Departamental' : 'Aguardando validação')}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider block">
                    Validação do Gestor / Direção
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {timesheet.approved_at ? `Aprovado em ${new Date(timesheet.approved_at).toLocaleDateString('pt-PT')}` : 'Pendente de aprovação'}
                  </span>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-400 pt-4 border-t border-slate-100">
                Documento extraído eletronicamente do Sistema Integrado de Operações da SI Holdings em {new Date().toLocaleString('pt-PT')}.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
