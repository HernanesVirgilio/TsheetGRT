import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert } from './Alert';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { t } from '../../lib/i18n';
import type { ErrorKind } from '../../lib/errors';

interface LoadingStateProps {
  label?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ label = 'A carregar...' }) => (
  <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-text-secondary">
    <span className="text-sidebar">
      <Spinner />
    </span>
    <span>{label}</span>
  </div>
);

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  /** Natureza da falha: define o título e se faz sentido tentar de novo. */
  kind?: ErrorKind | null;
  /** Desativa "Tentar novamente" enquanto o pedido repetido está em curso. */
  isRetrying?: boolean;
}

// Função ou coluna em falta e permissão recusada não se resolvem a repetir o pedido: sem "Tentar novamente".
const NOT_RETRYABLE: readonly ErrorKind[] = ['schema', 'permission'];

function titleFor(kind: ErrorKind | null | undefined): string {
  switch (kind) {
    case 'schema':
      return t('Base de dados por atualizar');
    case 'permission':
      return t('Sem acesso a estes dados');
    case 'network':
      return t('Sem ligação ao servidor');
    default:
      return t('Não foi possível carregar os dados');
  }
}

export const ErrorState: React.FC<ErrorStateProps> = ({ title, message, onRetry, kind, isRetrying = false }) => {
  const canRetry = Boolean(onRetry) && !(kind && NOT_RETRYABLE.includes(kind));
  return (
    <Alert
      variant="error"
      title={title ?? titleFor(kind)}
      action={
        canRetry && (
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry} isLoading={isRetrying} disabled={isRetrying}>
            {t('Tentar novamente')}
          </Button>
        )
      }
    >
      {message}
    </Alert>
  );
};
