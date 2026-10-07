import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  Filter,
  Calendar,
  Building2,
  Users,
  Clock,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService, formatMinutesToHours } from '../../services/dataService';
import { Timesheet, Department, Profile } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';

type ReportTab =
  | 'BY_EMPLOYEE'
  | 'BY_DEPARTMENT'
  | 'HOURS_BY_PERIOD'
  | 'PENDING_APPROVALS'
  | 'MISSING_SUBMISSIONS';

export const ReportsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [data, setData] = useState<Timesheet[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);

  // Selected Report Type
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('BY_EMPLOYEE');

  // Filter state
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedEmp, setSelectedEmp] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  useEffect(() => {
    if (currentUser) {
      setDepartments(dataService.getDepartments());
      setEmployees(dataService.getProfiles());
      loadReport();
    }
  }, [currentUser]);

  const loadReport = () => {
    const list = dataService.generateReportData({
      departmentId: selectedDept !== 'ALL' ? selectedDept : undefined,
      employeeId: selectedEmp !== 'ALL' ? selectedEmp : undefined,
      status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
    });
    setData(list);
  };

  useEffect(() => {
    loadReport();
  }, [selectedDept, selectedEmp, selectedStatus]);

  // Tab-filtered data
  const getTabFilteredData = (): Timesheet[] => {
    switch (activeReportTab) {
      case 'PENDING_APPROVALS':
        return data.filter((t) => t.status === 'SUBMITTED');
      case 'MISSING_SUBMISSIONS':
        return data.filter((t) => t.status === 'DRAFT' || t.status === 'REJECTED');
      case 'BY_EMPLOYEE':
      case 'BY_DEPARTMENT':
      case 'HOURS_BY_PERIOD':
      default:
        return data;
    }
  };

  const displayedData = getTabFilteredData();
  const totalMinutes = displayedData.reduce((acc, t) => acc + (t.total_minutes || 0), 0);

  // CSV Export tailored to the current report view
  const handleExportCSV = () => {
    if (displayedData.length === 0) return;

    const headers = [
      'Relatório',
      'Colaborador',
      'Departamento',
      'Período Início',
      'Período Fim',
      'Estado',
      'Horas Totais',
      'Submetido Em',
      'Aprovado Em',
    ];

    const rows = displayedData.map((t) => [
      `"${activeReportTab}"`,
      `"${t.employee?.full_name || 'Desconhecido'}"`,
      `"${t.employee?.department?.name || 'Geral'}"`,
      t.period_start,
      t.period_end,
      t.status,
      formatMinutesToHours(t.total_minutes || 0),
      t.submitted_at || '',
      t.approved_at || '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `relatorio_${activeReportTab.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios Operacionais"
        subtitle="Consolidação e análise de folhas de ponto da organização SI Holdings."
        actions={
          <button
            onClick={handleExportCSV}
            disabled={displayedData.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#D9E0E7] text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded shadow-xs transition disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-[#1F5FAD]" />
            Exportar CSV
          </button>
        }
      />

      {/* 5 Distinct Report Tabs (Requirement 44) */}
      <div className="border-b border-[#D9E0E7] flex flex-wrap items-center gap-2 sm:gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveReportTab('BY_EMPLOYEE')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition ${
            activeReportTab === 'BY_EMPLOYEE'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>1. Por Colaborador</span>
        </button>

        <button
          onClick={() => setActiveReportTab('BY_DEPARTMENT')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition ${
            activeReportTab === 'BY_DEPARTMENT'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>2. Por Departamento</span>
        </button>

        <button
          onClick={() => setActiveReportTab('HOURS_BY_PERIOD')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition ${
            activeReportTab === 'HOURS_BY_PERIOD'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>3. Horas por Período</span>
        </button>

        <button
          onClick={() => setActiveReportTab('PENDING_APPROVALS')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition ${
            activeReportTab === 'PENDING_APPROVALS'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          <span>4. Aprovações Pendentes</span>
        </button>

        <button
          onClick={() => setActiveReportTab('MISSING_SUBMISSIONS')}
          className={`pb-3 flex items-center gap-1.5 border-b-2 transition ${
            activeReportTab === 'MISSING_SUBMISSIONS'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          <span>5. Submissões em Falta</span>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-[#D9E0E7] shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Filtrar Departamento</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full p-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
            >
              <option value="ALL">Todos os Departamentos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Filtrar Colaborador</label>
            <select
              value={selectedEmp}
              onChange={(e) => setSelectedEmp(e.target.value)}
              className="w-full p-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
            >
              <option value="ALL">Todos os Colaboradores</option>
              {employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Estado</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={activeReportTab === 'PENDING_APPROVALS' || activeReportTab === 'MISSING_SUBMISSIONS'}
              className="w-full p-2 border border-[#D9E0E7] rounded bg-white text-slate-800 disabled:bg-slate-100"
            >
              <option value="ALL">Todos os Estados</option>
              <option value="DRAFT">Rascunho</option>
              <option value="SUBMITTED">Submetido</option>
              <option value="APPROVED">Aprovado</option>
              <option value="REJECTED">Rejeitado</option>
            </select>
          </div>
        </div>

        {/* Dynamic Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block">Total de Registos Filtrados:</span>
            <span className="text-lg font-bold text-slate-800">{displayedData.length} timesheets</span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block">Horas Consolidadas no Filtro:</span>
            <span className="text-lg font-bold text-[#1F5FAD]">{formatMinutesToHours(totalMinutes)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <span className="text-slate-500 block">Âmbito do Relatório:</span>
            <span className="text-sm font-semibold text-slate-700">
              {activeReportTab === 'PENDING_APPROVALS' && 'Submissões a aguardar parecer do gestor'}
              {activeReportTab === 'MISSING_SUBMISSIONS' && 'Timesheets em rascunho ou pendentes de correção'}
              {activeReportTab === 'BY_DEPARTMENT' && 'Agrupamento por unidade orgânica'}
              {activeReportTab === 'HOURS_BY_PERIOD' && 'Consolidação de ciclos mensais'}
              {activeReportTab === 'BY_EMPLOYEE' && 'Acompanhamento individual por colaborador'}
            </span>
          </div>
        </div>
      </div>

      {/* Report Table */}
      {displayedData.length === 0 ? (
        <EmptyState
          title="Sem registos para o relatório selecionado"
          message="Não foram encontrados dados que satisfaçam os filtros aplicados."
          icon={BarChart3}
        />
      ) : (
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Colaborador</th>
                  <th className="py-3 px-4">Departamento</th>
                  <th className="py-3 px-4">Período de Apuração</th>
                  <th className="py-3 px-4">Horas Totais</th>
                  <th className="py-3 px-4">Registos</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Submissão / Aprovação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedData.map((ts) => (
                  <tr key={ts.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                      {ts.employee?.full_name}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {ts.employee?.department?.name || 'Geral'}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {ts.period_start} a {ts.period_end}
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
                      {ts.status === 'APPROVED' && ts.approved_at
                        ? `Aprovado em ${new Date(ts.approved_at).toLocaleDateString('pt-PT')}`
                        : ts.status === 'SUBMITTED' && ts.submitted_at
                        ? `Submetido em ${new Date(ts.submitted_at).toLocaleDateString('pt-PT')}`
                        : ts.status === 'REJECTED'
                        ? 'Devolvido para correção'
                        : 'Pendente de envio'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
