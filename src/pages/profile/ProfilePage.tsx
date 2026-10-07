import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Building, Briefcase, Shield, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { PageHeader } from '../../components/ui/PageHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { StatusBadge } from '../../components/ui/StatusBadge';

export const ProfilePage: React.FC = () => {
  const { currentUser, role, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!currentUser) return null;

  const handleUpdateContact = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      dataService.updateProfile(currentUser.id, { phone: phone.trim() || null }, currentUser.id);
      refreshProfile();
      setSuccessMessage('Dados de contacto atualizados com sucesso.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao atualizar dados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Meu Perfil"
        subtitle="Informações institucionais, dados cadastrais e segurança da conta."
      />

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-xs text-[#C0392B] rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Profile Info Card */}
      <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <UserAvatar name={currentUser.full_name} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">{currentUser.full_name}</h2>
                <StatusBadge status={currentUser.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
              </div>
              <p className="text-xs text-[#1F5FAD] font-semibold mt-0.5">
                {currentUser.job_title || 'Colaborador da SI Holdings'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Nº de Colaborador: <strong className="text-slate-700">{currentUser.employee_number || 'SIH'}</strong>
              </p>
            </div>
          </div>

          <div>
            <button
              onClick={() => navigate('/alterar-palavra-passe')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#D9E0E7] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded shadow-xs transition"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#1F5FAD]" />
              Alterar Palavra-passe
            </button>
          </div>
        </div>

        {/* Read-only Institutional Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6 border-b border-slate-100 text-xs">
          <div>
            <span className="text-slate-500 font-medium block mb-1">E-mail Institucional:</span>
            <div className="flex items-center gap-2 text-slate-800 font-semibold bg-slate-50 p-2.5 rounded border border-slate-200">
              <Mail className="w-4 h-4 text-slate-400" />
              <span>{currentUser.email}</span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 font-medium block mb-1">Departamento Alocado:</span>
            <div className="flex items-center gap-2 text-slate-800 font-semibold bg-slate-50 p-2.5 rounded border border-slate-200">
              <Building className="w-4 h-4 text-slate-400" />
              <span>{currentUser.department?.name || 'Não atribuído'}</span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 font-medium block mb-1">Perfil de Acesso (Role):</span>
            <div className="flex items-center gap-2 text-slate-800 font-semibold bg-slate-50 p-2.5 rounded border border-slate-200">
              <Shield className="w-4 h-4 text-slate-400" />
              <span>{role || 'EMPLOYEE'}</span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 font-medium block mb-1">Último Acesso Registado:</span>
            <div className="flex items-center gap-2 text-slate-800 font-semibold bg-slate-50 p-2.5 rounded border border-slate-200">
              <span>{currentUser.last_login_at ? new Date(currentUser.last_login_at).toLocaleString('pt-PT') : 'Sessão atual'}</span>
            </div>
          </div>
        </div>

        {/* Editable User Contact Form */}
        <form onSubmit={handleUpdateContact} className="pt-6 text-xs space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Contacto Telefónico Pessoal
          </h3>

          <div className="max-w-md">
            <label className="block font-semibold text-slate-700 mb-1">Número de Telefone</label>
            <div className="relative">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+258 84 000 0000"
                className="w-full px-3 py-2 pl-9 border border-[#D9E0E7] rounded bg-white text-slate-900"
              />
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white font-semibold rounded text-xs transition"
          >
            Guardar Contacto
          </button>
        </form>
      </div>
    </div>
  );
};
