import React from 'react';
import { Lock } from 'lucide-react';
import { ErrorPageLayout } from './ErrorPageLayout';
import { t } from '../lib/i18n';

/** Página pedida existe, mas o perfil do utilizador não inclui a permissão necessária. */
export const UnauthorizedPage: React.FC = () => (
  <ErrorPageLayout
    title={t('Acesso restrito')}
    message={t('Esta página não está disponível para o seu perfil de acesso. Se precisar dela para o seu trabalho, peça ao administrador que reveja as suas permissões.')}
    icon={Lock}
  />
);
