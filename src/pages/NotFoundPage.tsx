import React from 'react';
import { FileQuestion } from 'lucide-react';
import { ErrorPageLayout } from './ErrorPageLayout';

export const NotFoundPage: React.FC = () => (
  <ErrorPageLayout
    code="404"
    title="Página não encontrada"
    message="A página que procura não existe ou foi movida. Verifique o endereço ou regresse à página inicial."
    icon={FileQuestion}
  />
);
