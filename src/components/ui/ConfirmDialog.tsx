import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const confirmBtnStyles =
    variant === 'danger'
      ? 'bg-[#C0392B] hover:bg-[#a93226] text-white'
      : variant === 'warning'
      ? 'bg-[#D97706] hover:bg-[#b45309] text-white'
      : 'bg-[#1F5FAD] hover:bg-[#184d8f] text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        className="w-full max-w-md bg-white rounded-lg shadow-xl border border-[#D9E0E7] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-[#D9E0E7]">
          <div className="flex items-center gap-2 text-[#1F2937]">
            <AlertTriangle className={`w-5 h-5 ${variant === 'danger' ? 'text-[#C0392B]' : 'text-[#D97706]'}`} />
            <h3 id="confirm-dialog-title" className="font-semibold text-base text-[#1F2937]">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-600 p-1 rounded"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 bg-slate-50 border-t border-[#D9E0E7]">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded hover:bg-slate-50 transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium rounded transition flex items-center gap-2 ${confirmBtnStyles}`}
          >
            {isLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
