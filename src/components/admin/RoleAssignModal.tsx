import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { getErrorMessage } from '../../lib/errors';
import { assignUserRole } from '../../services/userService';
import type { Profile, Role } from '../../types';

interface RoleAssignModalProps {
  user: Profile | null;
  roles: Role[];
  canAssignAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export const RoleAssignModal: React.FC<RoleAssignModalProps> = ({ user, roles, canAssignAdmin, onClose, onSaved }) => {
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedRoleId(user?.role?.id ?? '');
    setErrorMessage(null);
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const selectedRole = roles.find((role) => role.id === selectedRoleId);
    if (!selectedRole) {
      setErrorMessage('Selecione um perfil de acesso.');
      return;
    }
    if (selectedRole.id === user.role?.id) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await assignUserRole(user.id, selectedRole.id);
      onSaved(`Perfil de acesso de ${user.full_name} alterado para ${selectedRole.name}.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível alterar o perfil de acesso.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'role-assign-form';

  return (
    <Modal
      isOpen={Boolean(user)}
      title="Alterar perfil de acesso"
      description={user ? `Defina as permissões de ${user.full_name}.` : undefined}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-3">
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <fieldset className="space-y-2">
          <legend className="sr-only">Perfil de acesso</legend>
          {roles.map((role) => {
            const isDisabled = role.code === 'ADMIN' && !canAssignAdmin;
            const isSelected = selectedRoleId === role.id;
            return (
              <label
                key={role.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                  isSelected ? 'border-primary-hover bg-primary-soft' : 'border-border hover:bg-background'
                } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={role.id}
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => setSelectedRoleId(role.id)}
                  className="mt-1 accent-primary-hover"
                />
                <span>
                  <span className="block text-sm font-semibold text-text">
                    {role.name}
                    {user?.role?.id === role.id && <span className="font-normal text-text-muted"> (atual)</span>}
                  </span>
                  <span className="block text-sm text-text-secondary">{role.description}</span>
                  {isDisabled && (
                    <span className="block text-xs text-text-muted">Apenas administradores podem atribuir este perfil.</span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      </form>
    </Modal>
  );
};
