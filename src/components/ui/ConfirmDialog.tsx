import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  /** Erro da operação, apresentado dentro do diálogo para o utilizador poder tentar de novo. */
  errorMessage?: string | null;
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
  errorMessage,
  onConfirm,
  onCancel,
}) => (
  <Modal
    isOpen={isOpen}
    title={title}
    size="sm"
    isBusy={isLoading}
    onClose={onCancel}
    footer={
      <>
        <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={variant === 'primary' ? 'primary' : 'danger'} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="space-y-3 text-sm text-text-secondary">
      <div>{message}</div>
      {errorMessage && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  </Modal>
);
