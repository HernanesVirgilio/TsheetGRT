import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Lock, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import {
  ADMIN_ONLY_PERMISSION,
  listPermissions,
  listRolesWithAccess,
  LOCKED_ROLE_CODE,
  setRolePermissions,
} from '../../services/roleService';
import type { RoleWithAccess } from '../../services/roleService';
import type { Permission, PermissionCode } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { pluralize } from '../../utils/format';

const MODULE_LABELS: Record<string, string> = {
  core: 'Geral',
  profile: 'Perfil do utilizador',
  timesheet: 'Registo de horas',
  team: 'Gestão de equipa',
  approvals: 'Aprovações',
  users: 'Utilizadores',
  roles: 'Perfis de acesso',
  permissions: 'Permissões',
  departments: 'Departamentos',
  audit: 'Auditoria',
  health: 'Saúde do sistema',
  settings: 'Configurações',
  it: 'Suporte IT',
  reports: 'Relatórios',
  admin: 'Administração global',
};

function groupByModule(permissions: Permission[]): [string, Permission[]][] {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions) {
    groups.set(permission.module, [...(groups.get(permission.module) ?? []), permission]);
  }
  return [...groups.entries()];
}

interface PermissionEditorProps {
  role: RoleWithAccess | null;
  permissions: Permission[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

const PermissionEditor: React.FC<PermissionEditorProps> = ({ role, permissions, onClose, onSaved }) => {
  const [selectedCodes, setSelectedCodes] = useState<Set<PermissionCode>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedCodes(new Set(role?.permissions.map((permission) => permission.code) ?? []));
    setErrorMessage(null);
  }, [role]);

  const groupedPermissions = useMemo(() => groupByModule(permissions), [permissions]);

  const togglePermission = (code: PermissionCode) =>
    setSelectedCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const handleSave = async () => {
    if (!role) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await setRolePermissions(role.code, [...selectedCodes]);
      onSaved(`Permissões do perfil ${role.name} atualizadas com sucesso.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar as permissões.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(role)}
      title={`Permissões do perfil ${role?.name ?? ''}`}
      description={`${pluralize(selectedCodes.size, 'permissão selecionada', 'permissões selecionadas')}. As alterações aplicam-se a todos os utilizadores com este perfil.`}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSave} isLoading={isSubmitting}>
            Guardar permissões
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {groupedPermissions.map(([module, modulePermissions]) => (
          <fieldset key={module} className="rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sidebar">
              {MODULE_LABELS[module] ?? module}
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modulePermissions.map((permission) => {
                const isAdminOnly = permission.code === ADMIN_ONLY_PERMISSION;
                return (
                  <label
                    key={permission.id}
                    className={`flex items-start gap-3 rounded-md p-2 hover:bg-background ${isAdminOnly ? 'opacity-60' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCodes.has(permission.code)}
                      disabled={isAdminOnly}
                      onChange={() => togglePermission(permission.code)}
                      className="mt-1 h-4 w-4 accent-primary-hover"
                    />
                    <span>
                      <span className="block text-sm font-medium text-text">{permission.name}</span>
                      <span className="block font-mono text-xs text-text-muted">{permission.code}</span>
                      {isAdminOnly && <span className="block text-xs text-text-muted">Exclusiva do perfil ADMIN.</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
};

export const RolesPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('PERMISSIONS_MANAGE');
  const data = useAsyncData(() => Promise.all([listRolesWithAccess(), listPermissions()]), []);
  const [roles, permissions] = data.data ?? [[], []];

  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [roleToEdit, setRoleToEdit] = useState<RoleWithAccess | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSaved = (message: string) => {
    setRoleToEdit(null);
    setSuccessMessage(message);
    data.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Roles e permissões" subtitle="Perfis de acesso e respetivas permissões no sistema." />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {data.error && <ErrorState message={data.error} onRetry={data.reload} />}
      {data.isLoading && !data.data && <LoadingState label="A carregar perfis de acesso..." />}

      <ul className="space-y-3">
        {roles.map((role) => {
          const isExpanded = expandedRoleId === role.id;
          const isLocked = role.code === LOCKED_ROLE_CODE;
          const panelId = `role-permissions-${role.id}`;
          return (
            <li key={role.id} className="rounded-lg border border-border bg-surface">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sidebar" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-text">
                      {role.name} <span className="font-mono text-xs font-normal text-text-muted">{role.code}</span>
                    </p>
                    <p className="text-sm text-text-secondary">{role.description}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {pluralize(role.user_count, 'utilizador', 'utilizadores')} ·{' '}
                      {pluralize(role.permissions.length, 'permissão', 'permissões')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isLocked ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      Todas as permissões (não editável)
                    </span>
                  ) : (
                    canManage && (
                      <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setRoleToEdit(role)}>
                        Gerir permissões
                      </Button>
                    )
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={isExpanded ? ChevronUp : ChevronDown}
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                  >
                    {isExpanded ? 'Ocultar' : 'Ver permissões'}
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div id={panelId} className="border-t border-border bg-background p-4">
                  {role.permissions.length === 0 ? (
                    <p className="text-sm text-text-secondary">Este perfil não tem permissões atribuídas.</p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {role.permissions.map((permission) => (
                        <li key={permission.id} className="rounded-md border border-border bg-surface px-3 py-2">
                          <p className="text-sm text-text">{permission.name}</p>
                          <p className="font-mono text-xs text-text-muted">{permission.code}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <PermissionEditor role={roleToEdit} permissions={permissions} onClose={() => setRoleToEdit(null)} onSaved={handleSaved} />
    </div>
  );
};
