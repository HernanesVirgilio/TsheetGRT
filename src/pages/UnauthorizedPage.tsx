import React from 'react';
import { Lock } from 'lucide-react';
import { ErrorPageLayout } from './ErrorPageLayout';

/** Página pedida existe, mas o perfil do utilizador não inclui a permissão necessária. */
export const UnauthorizedPage: React.FC = () => (
  <ErrorPageLayout
    title="Acesso restrito"
    message="Esta página não está disponível para o seu perfil de acesso. Se precisar dela para o seu trabalho, peça ao administrador que reveja as suas permissões."
    icon={Lock}
  />
);
