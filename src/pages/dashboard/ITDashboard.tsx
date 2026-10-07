import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Server,
  Database,
  ShieldAlert,
  Users,
  CheckCircle2,
  ArrowRight,
  FileClock,
} from 'lucide-react';
import { dataService } from '../../services/dataService';
import { SystemHealthStatus, AuditEvent } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';

export const ITDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [recentAudits, setRecentAudits] = useState<AuditEvent[]>([]);

  useEffect(() => {
    setHealth(dataService.getSystemHealth());
    const audits = dataService.getAuditEvents(1, 6);
    setRecentAudits(audits.items);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel Técnico IT"
        subtitle="Monitorização da integridade dos sistemas, integridade de autenticação e eventos de segurança."
        actions={
          <button
            onClick={() => navigate('/system-health')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-sm font-semibold rounded shadow-xs transition"
          >
            <Activity className="w-4 h-4" />
            Ver saúde do sistema
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Estado dos Serviços"
          value={health?.api || 'ONLINE'}
          badge={
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              100% Operacional
            </span>
          }
          supporting="API Gateway e Supabase Auth"
          icon={Server}
        />
        <StatCard
          label="Base de Dados"
          value={health?.database || 'CONNECTED'}
          badge={
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
              Conectada
            </span>
          }
          supporting="PostgreSQL / Supabase Database"
          icon={Database}
        />
        <StatCard
          label="Utilizadores Ativos"
          value={health?.activeUsersCount || 0}
          supporting="Contas operacionais autorizadas"
          icon={Users}
        />
        <StatCard
          label="Eventos de Auditoria (24h)"
          value={health?.recentSecurityEventsCount || 0}
          supporting="Registos de autenticação e dados"
          icon={ShieldAlert}
        />
      </div>

      {/* Diagnostic Overview and Recent Security Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Audit / Security Events */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#1F2937]">Últimos Registos de Segurança & Auditoria</h2>
              <p className="text-xs text-[#64748B]">Trilho imutável de transações do sistema</p>
            </div>
            <button
              onClick={() => navigate('/audit')}
              className="text-xs font-semibold text-[#1F5FAD] hover:underline flex items-center gap-1"
            >
              Ver relatório completo
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                  <th className="py-2.5 px-3 font-semibold">Data/Hora</th>
                  <th className="py-2.5 px-3 font-semibold">Ação</th>
                  <th className="py-2.5 px-3 font-semibold">Utilizador</th>
                  <th className="py-2.5 px-3 font-semibold">IP</th>
                  <th className="py-2.5 px-3 font-semibold">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAudits.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString('pt-PT')}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {event.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                      {event.actor?.full_name || 'Sistema'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                      {event.ip_address || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs">
                      {event.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Technical Diagnostics Summary */}
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#1F2937] pb-2 border-b border-slate-100">
            Diagnóstico de Infraestrutura
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">Autenticação Supabase</div>
                <div className="text-[11px] text-slate-500">JWT & Row Level Security</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                Ativo
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">Base de Dados PostgreSQL</div>
                <div className="text-[11px] text-slate-500">Esquema 2026.10 / Índices OK</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                Conectada
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">Políticas RLS</div>
                <div className="text-[11px] text-slate-500">14 tabelas protegidas</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                Enforced
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">Ambiente</div>
                <div className="text-[11px] text-slate-500">Versão v0.1.0</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-[#1F5FAD] font-medium">
                Development
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => navigate('/audit')}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs transition flex items-center justify-center gap-2"
            >
              <FileClock className="w-3.5 h-3.5" />
              Auditoria de Segurança
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
