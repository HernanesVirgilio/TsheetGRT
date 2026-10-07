import React from 'react';
import { CheckCircle2, Clock, XCircle, Lock, AlertCircle } from 'lucide-react';
import { TimesheetStatus, ApprovalStatus } from '../../types';

interface StatusBadgeProps {
  status: TimesheetStatus | ApprovalStatus | 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  const statusStr = String(status).toUpperCase();

  switch (statusStr) {
    case 'APPROVED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-emerald-200 bg-emerald-50 text-emerald-800 ${sizeClasses}`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Aprovado
        </span>
      );

    case 'SUBMITTED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-amber-200 bg-amber-50 text-amber-800 ${sizeClasses}`}>
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Submetido
        </span>
      );

    case 'PENDING':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-amber-200 bg-amber-50 text-amber-800 ${sizeClasses}`}>
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Pendente
        </span>
      );

    case 'DRAFT':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-slate-200 bg-slate-50 text-slate-700 ${sizeClasses}`}>
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          Rascunho
        </span>
      );

    case 'REJECTED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-red-200 bg-red-50 text-red-800 ${sizeClasses}`}>
          <XCircle className="w-3.5 h-3.5 text-red-600" />
          Rejeitado
        </span>
      );

    case 'LOCKED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-slate-300 bg-slate-100 text-slate-800 ${sizeClasses}`}>
          <Lock className="w-3.5 h-3.5 text-slate-600" />
          Bloqueado
        </span>
      );

    case 'ACTIVE':
    case 'TRUE':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-emerald-200 bg-emerald-50 text-emerald-800 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Ativo
        </span>
      );

    case 'INACTIVE':
    case 'FALSE':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-slate-200 bg-slate-50 text-slate-600 ${sizeClasses}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          Inativo
        </span>
      );

    case 'BLOCKED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded border border-red-200 bg-red-50 text-red-800 ${sizeClasses}`}>
          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
          Bloqueado
        </span>
      );

    default:
      return (
        <span className={`inline-flex items-center gap-1 font-medium rounded border border-slate-200 bg-slate-50 text-slate-700 ${sizeClasses}`}>
          {String(status)}
        </span>
      );
  }
};
