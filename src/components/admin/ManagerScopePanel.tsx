import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { addManagerScope, listManagerScopes, removeManagerScope } from '../../services/managerScopeService';
import type { ManagerScope, ScopeTarget } from '../../services/managerScopeService';
import { listUsers } from '../../services/userService';
import type { Department, Profile } from '../../types';
import { Panel } from '../ui/Panel';
import { Alert } from '../ui/Alert';
import { Button, IconButton } from '../ui/Button';
import { SelectField } from '../ui/FormField';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorState, LoadingState } from '../ui/States';
import { formatDate } from '../../utils/format';
import { t } from '../../lib/i18n';

type TargetKind = ScopeTarget['kind'];

interface ManagerScopePanelProps {
  manager: Profile;
  departments: Department[];
  canManage: boolean;
}

function describeScope(scope: ManagerScope): string {
  if (scope.departmentId) return t('Departamento: {departmentName}', { departmentName: scope.departmentName ?? '—' });
  return t('Colaborador: {employeeName}', { employeeName: scope.employeeName ?? '—' });
}

/**
 * Âmbito de gestão: atribuído apenas pela administração (validado e auditado no servidor).
 *   * GESTOR: a sua equipa (departamentos e/ou colaboradores; nunca outros gestores ou managers).
 *   * MANAGER: os gestores que supervisiona (por colaborador) e, se for o caso, equipas sem gestor.
 */
export const ManagerScopePanel: React.FC<ManagerScopePanelProps> = ({ manager, departments, canManage }) => {
  const scopes = useAsyncData(() => listManagerScopes(manager.id), [manager.id]);
  const employees = useAsyncData(() => (canManage ? listUsers() : Promise.resolve([])), [canManage]);

  const [targetKind, setTargetKind] = useState<TargetKind>('department');
  const [targetId, setTargetId] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scopeToRemove, setScopeToRemove] = useState<ManagerScope | null>(null);

  const assignedDepartmentIds = new Set((scopes.data ?? []).map((scope) => scope.departmentId));
  const assignedEmployeeIds = new Set((scopes.data ?? []).map((scope) => scope.employeeId));
  const departmentOptions = departments.filter((department) => department.active && !assignedDepartmentIds.has(department.id));
  const isGestor = manager.role?.code === 'GESTOR';
  // Espelho da regra do servidor: um gestor só tem colaboradores; ninguém tem administradores no âmbito.
  const employeeOptions = (employees.data ?? []).filter(
    (employee) =>
      employee.is_active &&
      employee.id !== manager.id &&
      !assignedEmployeeIds.has(employee.id) &&
      employee.role?.code !== 'ADMIN' &&
      !(isGestor && (employee.role?.code === 'MANAGER' || employee.role?.code === 'GESTOR'))
  );

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!targetId) {
      setFieldError(targetKind === 'department' ? t('Selecione o departamento.') : t('Selecione o colaborador.'));
      return;
    }
    setFieldError(null);
    setIsSaving(true);
    try {
      await addManagerScope(
        manager.id,
        targetKind === 'department' ? { kind: 'department', departmentId: targetId } : { kind: 'employee', employeeId: targetId }
      );
      setTargetId('');
      setSuccessMessage(t('Âmbito atribuído com sucesso.'));
      scopes.reload();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível atribuir o âmbito.')));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!scopeToRemove) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await removeManagerScope(scopeToRemove.id);
      setSuccessMessage(t('Âmbito removido com sucesso.'));
      scopes.reload();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível remover o âmbito.')));
    } finally {
      setIsSaving(false);
      setScopeToRemove(null);
    }
  };

  return (
    <Panel
      title={t('Âmbito de gestão')}
      description={
        isGestor
          ? t('Equipa direta deste gestor: departamentos (colaboradores com perfil COLABORADOR) e colaboradores individuais.')
          : t('Gestores supervisionados (adicione-os como colaborador) e equipas sem gestor. O Manager vê também as equipas dos gestores que supervisiona.')
      }
    >
      <div className="space-y-4">
        {successMessage && (
          <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {scopes.error && <ErrorState message={scopes.error} onRetry={scopes.reload} />}
        {scopes.isLoading && !scopes.data && <LoadingState />}

        {scopes.data?.length === 0 && (
          <p className="text-sm text-text-secondary">
            {t('Sem âmbito atribuído: este gestor ainda não tem equipa nem pode aprovar timesheets.')}
          </p>
        )}
        {scopes.data && scopes.data.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {scopes.data.map((scope) => (
              <li key={scope.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  <span className="block text-sm text-text">{describeScope(scope)}</span>
                  <span className="block text-xs text-text-muted">Atribuído em {formatDate(scope.createdAt)}</span>
                </span>
                {canManage && (
                  <IconButton icon={Trash2} tone="danger" label={t('Remover {scope}', { scope: describeScope(scope) })} onClick={() => setScopeToRemove(scope)} />
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form onSubmit={handleAdd} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[12rem_1fr_auto]" noValidate>
            <SelectField
              label={t('Tipo')}
              value={targetKind}
              onChange={(event) => {
                setTargetKind(event.target.value === 'employee' ? 'employee' : 'department');
                setTargetId('');
                setFieldError(null);
              }}
            >
              <option value="department">{t('Departamento')}</option>
              <option value="employee">{t('Colaborador')}</option>
            </SelectField>
            <SelectField
              label={targetKind === 'department' ? 'Departamento' : 'Colaborador'}
              value={targetId}
              error={fieldError}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">{t('Selecione…')}</option>
              {targetKind === 'department'
                ? departmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))
                : employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name} ({employee.department?.name ?? 'sem departamento'})
                    </option>
                  ))}
            </SelectField>
            <Button type="submit" icon={Plus} isLoading={isSaving} className={fieldError ? 'sm:mb-6' : ''}>
              {t('Atribuir')}
            </Button>
          </form>
        )}
        {employees.error && <p className="text-sm text-danger">{employees.error}</p>}
      </div>

      <ConfirmDialog
        isOpen={Boolean(scopeToRemove)}
        title={t('Remover âmbito?')}
        message={t('{full_name} deixa de ter acesso aos timesheets abrangidos ({scopeToRemove}).', { full_name: manager.full_name, scopeToRemove: scopeToRemove ? describeScope(scopeToRemove) : '' })}
        confirmLabel={t('Remover')}
        isLoading={isSaving}
        onConfirm={handleRemove}
        onCancel={() => setScopeToRemove(null)}
      />
    </Panel>
  );
};
