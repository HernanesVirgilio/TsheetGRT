import React from 'react';
import { ShieldX } from 'lucide-react';
import { ErrorPageLayout } from './ErrorPageLayout';

export const UnauthorizedPage: React.FC = () => (
  <ErrorPageLayout
    code="403"
    title="Acesso não autorizado"
    message="O seu perfil de acesso não tem permissão para esta área. Contacte o administrador se precisar deste acesso."
    icon={ShieldX}
  />
);
