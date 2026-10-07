import React from 'react';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const UnauthorizedPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-red-50 text-[#C0392B] border border-red-200 flex items-center justify-center mb-4">
        <ShieldX className="w-8 h-8" />
      </div>
      <span className="text-xs font-bold text-[#C0392B] uppercase tracking-wider mb-1">
        Erro 403
      </span>
      <h1 className="text-2xl font-bold text-[#1F2937] mb-2">
        Acesso não autorizado
      </h1>
      <p className="text-sm text-[#64748B] max-w-md mb-6 leading-relaxed">
        Não tem permissões para aceder a esta área. Contacte o administrador do sistema ou o suporte IT se necessita deste privilégio.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-sm font-medium rounded transition shadow-xs"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar ao dashboard
      </Link>
    </div>
  );
};
