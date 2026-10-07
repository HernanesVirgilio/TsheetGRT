import React, { useState, useEffect } from 'react';
import { Settings, Save, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { SystemSetting } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';

export const SettingsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [successMessage, setSuccessMessage] = useState('');

  // Local state for common settings
  const [companyName, setCompanyName] = useState('SI Holdings');
  const [timezone, setTimezone] = useState('Africa/Maputo');
  const [language, setLanguage] = useState('pt-PT');
  const [periodType, setPeriodType] = useState('MONTHLY');
  const [targetHours, setTargetHours] = useState('8');

  useEffect(() => {
    const list = dataService.getSystemSettings();
    setSettings(list);

    const getVal = (key: string, def: string) => list.find((s) => s.key === key)?.value || def;
    setCompanyName(getVal('COMPANY_NAME', 'SI Holdings'));
    setTimezone(getVal('DEFAULT_TIMEZONE', 'Africa/Maputo'));
    setLanguage(getVal('DEFAULT_LANGUAGE', 'pt-PT'));
    setPeriodType(getVal('TIMESHEET_PERIOD_TYPE', 'MONTHLY'));
    setTargetHours(getVal('TIMESHEET_DAILY_TARGET_HOURS', '8'));
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    dataService.updateSystemSetting('COMPANY_NAME', companyName, currentUser.id);
    dataService.updateSystemSetting('DEFAULT_TIMEZONE', timezone, currentUser.id);
    dataService.updateSystemSetting('DEFAULT_LANGUAGE', language, currentUser.id);
    dataService.updateSystemSetting('TIMESHEET_PERIOD_TYPE', periodType, currentUser.id);
    dataService.updateSystemSetting('TIMESHEET_DAILY_TARGET_HOURS', targetHours, currentUser.id);

    setSuccessMessage('Definições guardadas com sucesso.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Configurações do Sistema"
        subtitle="Parâmetros institucionais, regras de apuração de horas e definições regionais."
      />

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-6 space-y-6 text-xs">
        <div>
          <h3 className="text-sm font-bold text-[#1F2937] mb-1">Identidade Institucional</h3>
          <p className="text-slate-500 mb-4">Informação corporativa da organização.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome da Empresa</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Idioma Padrão</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
              >
                <option value="pt-PT">Português (Portugal / Moçambique - pt-PT)</option>
                <option value="en">Inglês (en)</option>
                <option value="pt-BR">Português (Brasil - pt-BR)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-sm font-bold text-[#1F2937] mb-1">Regras de Timesheet e Horas</h3>
          <p className="text-slate-500 mb-4">Configurações para o ciclo de validação de presenças.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fuso Horário Padrão</label>
              <input
                type="text"
                disabled
                value={timezone}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-slate-100 text-slate-700 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Timezone oficial de Maputo (CAT, UTC+2)</span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ciclo de Apuração</label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
              >
                <option value="MONTHLY">Mensal (01 ao fim do mês)</option>
                <option value="BIWEEKLY">Quinzenal</option>
                <option value="WEEKLY">Semanal</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Meta Diária de Horas Úteis</label>
              <input
                type="number"
                min={1}
                max={12}
                value={targetHours}
                onChange={(e) => setTargetHours(e.target.value)}
                className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Valor de referência padrão: 8 horas úteis</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-sm font-bold text-[#1F2937] mb-1">Base de Dados & Supabase Cloud</h3>
          <p className="text-slate-500 mb-4">Parâmetros da infraestrutura em nuvem conectada.</p>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">Projeto Supabase</span>
              <span className="font-mono text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">
                https://iahgopefwixbprfzcwbd.supabase.co
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">Estado da Ligação</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Conectado (API & Auth)
              </span>
            </div>
            <div className="pt-2 flex items-center justify-end">
              <a
                href="/system-health"
                className="text-xs text-[#1F5FAD] hover:underline font-semibold"
              >
                Gerir esquema SQL e diagnóstico de tabelas &rarr;
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-xs font-semibold rounded shadow-xs transition"
          >
            <Save className="w-4 h-4" />
            Guardar Configurações
          </button>
        </div>
      </form>
    </div>
  );
};
