import React, { useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { getErrorMessage } from '../../lib/errors';
import { setUserActive } from '../../services/userService';
import type { Profile } from '../../types';

interface UserStatusDialogProps {
  user: Profile | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Confirmação obrigatória antes de ativar/desativar uma conta. */
export const UserStatusDialog: React.FC<UserStatusDialogProps> = ({ user, onClose, onSaved }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => setErrorMessage(null), [user]);

  const willDeactivate = user?.is_active ?? false;

  const handleConfirm = async () => {
    if (!user) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await setUserActive(user.id, !user.is_active);
      onSaved(`Utilizador ${user.full_name} ${willDeactivate ? 'desativado' : 'ativado'} com sucesso.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível alterar o estado do utilizador.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ConfirmDialog
      isOpen={Boolean(user)}
      title={willDeactivate ? 'Desativar utilizador?' : 'Ativar utilizador?'}
      message={
        willDeactivate
          ? `${user?.full_name} deixará de conseguir aceder ao sistema. O histórico (timesheets e auditoria) é mantido e a conta pode ser reativada.`
          : `${user?.full_name} voltará a ter acesso com o perfil de acesso atualmente atribuído.`
      }
      confirmLabel={willDeactivate ? 'Desativar' : 'Ativar'}
      variant={willDeactivate ? 'danger' : 'primary'}
      isLoading={isSubmitting}
      errorMessage={errorMessage}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
};
