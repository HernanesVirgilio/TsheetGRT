import React from 'react';
import { FileQuestion } from 'lucide-react';
import { ErrorPageLayout } from './ErrorPageLayout';
import { t } from '../lib/i18n';

export const NotFoundPage: React.FC = () => (
  <ErrorPageLayout
    code="404"
    title={t('Página não encontrada')}
    message={t('A página que procura não existe ou foi movida. Verifique o endereço ou regresse à página inicial.')}
    icon={FileQuestion}
  />
);
