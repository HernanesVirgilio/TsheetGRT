import React, { useState, useEffect } from 'react';
import { FileClock, Search, Filter, Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { AuditEvent } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';

export const AuditPage: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const loadData = () => {
    const res = dataService.getAuditEvents(page, pageSize, filterAction, filterUser);
    setEvents(res.items);
    setTotal(res.total);
  };

  useEffect(() => {
    loadData();
  }, [page, filterAction, filterUser]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trilho de Auditoria"
        subtitle="Registo imutável de eventos de autenticação, mutações de dados e transações operacionais."
      />

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-[#D9E0E7] shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              type="text"
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPage(1);
              }}
              placeholder="Filtrar por ação (ex.: auth, timesheet)..."
              className="w-56 px-3 py-1.5 pl-8 border border-[#D9E0E7] rounded bg-white text-slate-800"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <div className="relative">
            <input
              type="text"
              value={filterUser}
              onChange={(e) => {
                setFilterUser(e.target.value);
                setPage(1);
              }}
              placeholder="Filtrar por utilizador..."
              className="w-52 px-3 py-1.5 pl-8 border border-[#D9E0E7] rounded bg-white text-slate-800"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          {(filterAction || filterUser) && (
            <button
              onClick={() => {
                setFilterAction('');
                setFilterUser('');
                setPage(1);
              }}
              className="text-[#1F5FAD] hover:underline font-semibold"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="text-slate-500">
          Total de <strong>{total}</strong> registos de auditoria registados
        </div>
      </div>

      {/* Audit Table */}
      {events.length === 0 ? (
        <EmptyState
          title="Nenhum evento de auditoria encontrado"
          message="Não existem registos de auditoria correspondentes aos critérios de pesquisa."
          icon={FileClock}
        />
      ) : (
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Data e Hora</th>
                  <th className="py-3 px-4">Utilizador / Ator</th>
                  <th className="py-3 px-4">Ação</th>
                  <th className="py-3 px-4">Entidade</th>
                  <th className="py-3 px-4">Endereço IP</th>
                  <th className="py-3 px-4">Descrição da Operação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-500 font-mono whitespace-nowrap">
                      {new Date(evt.created_at).toLocaleString('pt-PT')}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {evt.actor ? evt.actor.full_name : 'Sistema / Anon'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono px-2 py-0.5 rounded bg-blue-50 text-[#1F5FAD] font-semibold border border-blue-100">
                        {evt.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {evt.entity_type}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {evt.ip_address || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-md">
                      {evt.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-1.5 border border-[#D9E0E7] rounded hover:bg-slate-50 disabled:opacity-40"
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 border border-[#D9E0E7] rounded hover:bg-slate-50 disabled:opacity-40"
                aria-label="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
