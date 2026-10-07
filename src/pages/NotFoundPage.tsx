import React from 'react';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center mb-4">
        <FileQuestion className="w-8 h-8" />
      </div>
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
        Erro 404
      </span>
      <h1 className="text-2xl font-bold text-[#1F2937] mb-2">
        Página não encontrada
      </h1>
      <p className="text-sm text-[#64748B] max-w-md mb-6 leading-relaxed">
        A página que procura não existe ou não está disponível. Verifique o endereço ou regresse à página inicial.
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
