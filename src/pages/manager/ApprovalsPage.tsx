import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle,
  Clock3,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService, formatMinutesToHours } from '../../services/dataService';
import { Timesheet } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

export const ApprovalsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [pendingList, setPendingList] = useState<Timesheet[]>([]);
  const [historyList, setHistoryList] = useState<Timesheet[]>([]);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');

  // Review modal state
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [decisionModalType, setDecisionModalType] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const loadData = () => {
    if (currentUser) {
      const all = dataService.getTimesheets(currentUser);
      // Filter out self-timesheets from approval list (manager cannot approve self)
      const nonSelf = all.filter((t) => t.employee_id !== currentUser.id);
      setPendingList(nonSelf.filter((t) => t.status === 'SUBMITTED'));
      setHistoryList(nonSelf.filter((t) => t.status === 'APPROVED' || t.status === 'REJECTED'));
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleOpenDecision = (ts: Timesheet, type: 'APPROVE' | 'REJECT') => {
    setSelectedTimesheet(ts);
    setDecisionModalType(type);
    setDecisionComment('');
    setCommentError('');
  };

  const handleConfirmDecision = () => {
    if (!currentUser || !selectedTimesheet || !decisionModalType) return;

    if (decisionModalType === 'REJECT' && !decisionComment.trim()) {
      setCommentError('É obrigatório indicar uma justificação detalhada para a rejeição.');
      return;
    }

    setIsProcessing(true);
    try {
      if (decisionModalType === 'APPROVE') {
        dataService.approveTimesheet(selectedTimesheet.id, currentUser.id, decisionComment.trim());
      } else {
        dataService.rejectTimesheet(selectedTimesheet.id, currentUser.id, decisionComment.trim());
      }

      setDecisionModalType(null);
      setSelectedTimesheet(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao processar decisão');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aprovações de Timesheet"
        subtitle="Validação e controlo formal das horas de trabalho submetidas pela equipa."
      />

      {/* Tabs */}
      <div className="border-b border-[#D9E0E7] flex items-center gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'PENDING'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock3 className="w-4 h-4" />
          <span>Pendentes de Aprovação ({pendingList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'HISTORY'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Histórico de Validações ({historyList.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'PENDING' ? (
        pendingList.length === 0 ? (
          <EmptyState
            title="Não existem aprovações pendentes"
            message="Todas as folhas de ponto submetidas pela equipa foram devidamente avaliadas."
            icon={ClipboardCheck}
          />
        ) : (
          <div className="space-y-4">
            {pendingList.map((ts) => (
              <div
                key={ts.id}
                className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5 transition hover:border-slate-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={ts.employee?.full_name || 'Colaborador'} size="md" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">
                        {ts.employee?.full_name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Nº {ts.employee?.employee_number} · {ts.employee?.department?.name || 'Operações'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedTimesheet(ts)}
                      className="px-3 py-1.5 bg-white border border-[#D9E0E7] text-slate-700 hover:bg-slate-50 rounded text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspecionar Detalhes ({ts.entries?.length || 0})
                    </button>
                    <button
                      onClick={() => handleOpenDecision(ts, 'REJECT')}
                      className="px-3 py-1.5 bg-white border border-red-200 text-[#C0392B] hover:bg-red-50 rounded text-xs font-semibold flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Rejeitar
                    </button>
                    <button
                      onClick={() => handleOpenDecision(ts, 'APPROVE')}
                      className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aprovar Horas
                    </button>
                  </div>
                </div>

                <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block">Período de Apuração:</span>
                    <span className="font-semibold text-slate-700">
                      {ts.period_start} a {ts.period_end}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Horas Totais Submetidas:</span>
                    <span className="font-bold text-[#1F5FAD]">
                      {formatMinutesToHours(ts.total_minutes || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Submetido em:</span>
                    <span className="text-slate-700">
                      {ts.submitted_at ? new Date(ts.submitted_at).toLocaleString('pt-PT') : 'Recente'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Estado:</span>
                    <StatusBadge status={ts.status} size="sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* History list */
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4">Colaborador</th>
                <th className="py-3 px-4">Período</th>
                <th className="py-3 px-4">Horas</th>
                <th className="py-3 px-4">Estado Final</th>
                <th className="py-3 px-4">Data Decisão</th>
                <th className="py-3 px-4">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyList.map((ts) => (
                <tr key={ts.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-800">
                    {ts.employee?.full_name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {ts.period_start} a {ts.period_end}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#1F5FAD]">
                    {formatMinutesToHours(ts.total_minutes || 0)}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={ts.status} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {ts.approved_at
                      ? new Date(ts.approved_at).toLocaleDateString('pt-PT')
                      : ts.rejected_at
                      ? new Date(ts.rejected_at).toLocaleDateString('pt-PT')
                      : '—'}
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                    {ts.rejection_reason || 'Aprovado em conformidade'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inspect entries details modal */}
      {selectedTimesheet && !decisionModalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-3xl w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-[#1F2937]">
                  Detalhes do Timesheet: {selectedTimesheet.employee?.full_name}
                </h3>
                <p className="text-xs text-slate-500">
                  Período: {selectedTimesheet.period_start} a {selectedTimesheet.period_end} · Total: {formatMinutesToHours(selectedTimesheet.total_minutes || 0)}
                </p>
              </div>
              <button
                onClick={() => setSelectedTimesheet(null)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Fechar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-2 font-semibold">Data</th>
                    <th className="p-2 font-semibold">Atividade</th>
                    <th className="p-2 font-semibold">Horário</th>
                    <th className="p-2 font-semibold">Pausa</th>
                    <th className="p-2 font-semibold">Duração</th>
                    <th className="p-2 font-semibold">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedTimesheet.entries?.map((entry) => (
                    <tr key={entry.id}>
                      <td className="p-2 font-medium">{entry.work_date}</td>
                      <td className="p-2 text-slate-600">{entry.activity?.name || 'Operações'}</td>
                      <td className="p-2 font-mono">{entry.start_time} - {entry.end_time}</td>
                      <td className="p-2">{entry.break_minutes}m</td>
                      <td className="p-2 font-bold text-[#1F5FAD]">{formatMinutesToHours(entry.total_minutes)}</td>
                      <td className="p-2 text-slate-600 max-w-xs">{entry.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedTimesheet(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
              >
                Fechar
              </button>
              <button
                onClick={() => handleOpenDecision(selectedTimesheet, 'REJECT')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#C0392B] hover:bg-[#a93226] rounded"
              >
                Rejeitar
              </button>
              <button
                onClick={() => handleOpenDecision(selectedTimesheet, 'APPROVE')}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
              >
                Aprovar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Modal (Approve / Reject) */}
      {decisionModalType && selectedTimesheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-[#1F2937] mb-1">
              {decisionModalType === 'APPROVE' ? 'Aprovar Timesheet' : 'Rejeitar Timesheet'}
            </h3>
            <p className="text-xs text-[#64748B] mb-4">
              Colaborador: <strong>{selectedTimesheet.employee?.full_name}</strong> ({selectedTimesheet.period_start} a {selectedTimesheet.period_end})
            </p>

            {commentError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-xs text-[#C0392B] rounded flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{commentError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {decisionModalType === 'REJECT' ? 'Justificação da Rejeição (Obrigatório)' : 'Observações (Opcional)'}
                </label>
                <textarea
                  rows={3}
                  required={decisionModalType === 'REJECT'}
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder={
                    decisionModalType === 'REJECT'
                      ? 'Ex.: Registos do dia 05 não coincidem com escala de piquete...'
                      : 'Observação opcional para registo no histórico de aprovação...'
                  }
                  className="w-full p-2.5 border border-[#D9E0E7] rounded bg-white text-slate-800 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDecisionModalType(null);
                    setSelectedTimesheet(null);
                  }}
                  disabled={isProcessing}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDecision}
                  disabled={isProcessing}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded transition flex items-center gap-2 ${
                    decisionModalType === 'APPROVE'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-[#C0392B] hover:bg-[#a93226]'
                  }`}
                >
                  {isProcessing && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {decisionModalType === 'APPROVE' ? 'Confirmar Aprovação' : 'Confirmar Rejeição'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
