import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { addManagerScope, getProfileLeads } from '../../services/managerScopeService';
import { listUsers } from '../../services/userService';
import type { Profile } from '../../types';
import { Panel } from '../ui/Panel';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { SelectField } from '../ui/FormField';
import { ErrorState, LoadingState } from '../ui/States';

interface ProfileLeadsPanelProps {
  profile: Profile;
  canManage: boolean;
}

/**
 * Vista inversa do âmbito de gestão: a quem responde este utilizador. A relação continua a ser um
 * âmbito (manager_scopes) do gestor, validado e auditado no servidor; aqui pode ser criada a partir
 * do colaborador. Retirar uma atribuição faz-se na página do gestor (Âmbito de gestão).
 */
export const ProfileLeadsPanel: React.FC<ProfileLeadsPanelProps> = ({ profile, canManage }) => {
  const leads = useAsyncData(() => getProfileLeads(profile.id), [profile.id]);
  const users = useAsyncData(() => (canManage ? listUsers() : Promise.resolve([])), [canManage]);
  const [managerId, setManagerId] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isGestor = profile.role?.code === 'GESTOR';
  const directIds = new Set((leads.data ?? []).filter((lead) => lead.relation === 'LEAD').map((lead) => lead.managerId));
  // Espelho da regra do servidor: um gestor responde a um Manager; os restantes a um gestor ou Manager.
  const managerOptions = (users.data ?? []).filter(
    (user) =>
      user.is_active &&
      user.id !== profile.id &&
      !directIds.has(user.id) &&
      (user.role?.code === 'MANAGER' || (!isGestor && user.role?.code === 'GESTOR'))
  );

  const handleAssign = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!managerId) {
      setFieldError(isGestor ? 'Selecione o Manager.' : 'Selecione o gestor.');
      return;
    }
    setFieldError(null);
    setIsSaving(true);
    try {
      await addManagerScope(managerId, { kind: 'employee', employeeId: profile.id });
      const managerName = managerOptions.find((user) => user.id === managerId)?.full_name ?? 'O gestor';
      setManagerId('');
      setSuccessMessage(`${managerName} passa a ser responsável por ${profile.full_name}.`);
      leads.reload();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível atribuir o responsável.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Panel
      title="Responsáveis"
      description={
        isGestor
          ? 'Manager que supervisiona este gestor (e, através dele, a sua equipa).'
          : 'Gestor direto (por departamento ou atribuição individual) e o Manager que o supervisiona.'
      }
    >
      <div className="space-y-4">
        {successMessage && (
          <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {leads.error && <ErrorState message={leads.error} onRetry={leads.reload} />}
        {leads.isLoading && !leads.data && <LoadingState />}

        {leads.data?.length === 0 && (
          <p className="text-sm text-text-secondary">
            {isGestor
              ? 'Sem Manager atribuído: este gestor não tem supervisão e as decisões da equipa vão para a administração.'
              : 'Sem gestor atribuído: ninguém acompanha o trabalho, as ausências e os timesheets desta pessoa.'}
          </p>
        )}
        {leads.data && leads.data.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {leads.data.map((lead) => (
              <li key={lead.managerId} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <Link to={`/users/${lead.managerId}`} className="block text-sm font-semibold text-text hover:underline">
                    {lead.fullName}
                  </Link>
                  <span className="block text-xs text-text-muted">
                    {lead.relation === 'LEAD' ? 'Responsável direto' : 'Supervisão'} · {lead.via}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
                  {lead.roleCode ?? 'Sem perfil'}
                  {!lead.isActive && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-warning">Conta desativada</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form onSubmit={handleAssign} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]" noValidate>
            <SelectField
              label={isGestor ? 'Atribuir a um Manager' : 'Atribuir a um gestor'}
              value={managerId}
              error={fieldError}
              onChange={(event) => {
                setManagerId(event.target.value);
                setFieldError(null);
              }}
            >
              <option value="">Selecione…</option>
              {managerOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} · {user.role?.name ?? '—'}
                  {user.department?.name ? ` (${user.department.name})` : ''}
                </option>
              ))}
            </SelectField>
            <Button type="submit" icon={Plus} isLoading={isSaving} className={fieldError ? 'sm:mb-6' : ''}>
              Atribuir
            </Button>
          </form>
        )}
        {canManage && (
          <p className="text-xs text-text-muted">
            A atribuição é individual. Para retirar uma atribuição ou gerir departamentos, abra a página do gestor (Âmbito de gestão).
          </p>
        )}
        {users.error && <p className="text-sm text-danger">{users.error}</p>}
      </div>
    </Panel>
  );
};
