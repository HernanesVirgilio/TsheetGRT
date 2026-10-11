import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert } from './Alert';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { t } from '../../lib/i18n';

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
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = t('Não foi possível carregar os dados'),
  message,
  onRetry,
}) => (
  <Alert
    variant="error"
    title={title}
    action={
      onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
          {t('Tentar novamente')}
        </Button>
      )
    }
  >
    {message}
  </Alert>
);
