import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Pencil, Plus, Shield, UserCheck, UserX, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listUsers } from '../../services/userService';
import { listDepartments } from '../../services/departmentService';
import { listRoles } from '../../services/roleService';
import type { Profile } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn, SortState } from '../../components/ui/DataTable';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { UserFormModal } from '../../components/admin/UserFormModal';
import { RoleAssignModal } from '../../components/admin/RoleAssignModal';
import { UserStatusDialog } from '../../components/admin/UserStatusDialog';
import { formatDateTime } from '../../utils/format';

const PAGE_SIZE = 20;
const ALL = 'ALL';

type UserSortKey = 'name' | 'lastLogin';
type StatusFilter = typeof ALL | 'ACTIVE' | 'INACTIVE';

interface UserFilters {
  search: string;
  roleId: string;
  departmentId: string;
  status: StatusFilter;
}

const EMPTY_FILTERS: UserFilters = { search: '', roleId: ALL, departmentId: ALL, status: ALL };

function matchesFilters(user: Profile, filters: UserFilters): boolean {
  const search = filters.search.trim().toLowerCase();
  const matchesSearch =
    !search ||
    user.full_name.toLowerCase().includes(search) ||
    user.email.toLowerCase().includes(search) ||
    (user.employee_number ?? '').toLowerCase().includes(search);

  return (
    matchesSearch &&
    (filters.roleId === ALL || user.role?.id === filters.roleId) &&
    (filters.departmentId === ALL || user.department_id === filters.departmentId) &&
    (filters.status === ALL || (filters.status === 'ACTIVE') === user.is_active)
  );
}

function compareUsers(first: Profile, second: Profile, sort: SortState<UserSortKey>): number {
  const direction = sort.direction === 'asc' ? 1 : -1;
  if (sort.key === 'name') return first.full_name.localeCompare(second.full_name, 'pt-PT') * direction;
  // Quem nunca acedeu fica sempre no fim.
  const firstValue = first.last_login_at ?? '';
  const secondValue = second.last_login_at ?? '';
  if (!firstValue || !secondValue) return firstValue ? -1 : secondValue ? 1 : 0;
  return firstValue.localeCompare(secondValue) * direction;
}

function isStatusFilter(value: string): value is StatusFilter {
  return value === ALL || value === 'ACTIVE' || value === 'INACTIVE';
}

export const UsersPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const users = useAsyncData(listUsers, []);
  const referenceData = useAsyncData(() => Promise.all([listDepartments(), listRoles()]), []);
  const [departments, roles] = referenceData.data ?? [[], []];

  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState<UserSortKey>>({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<Profile | null>(null);
  const [userForRole, setUserForRole] = useState<Profile | null>(null);
  const [userForStatus, setUserForStatus] = useState<Profile | null>(null);

  const canCreate = hasPermission('USERS_CREATE') && hasPermission('USERS_ASSIGN_ROLE');
  const canUpdate = hasPermission('USERS_UPDATE');
  const canAssignRole = hasPermission('USERS_ASSIGN_ROLE');
  const canChangeStatus = hasPermission('USERS_DISABLE');
  const canAssignAdmin = hasPermission('ADMIN_ACCESS');

  const filteredUsers = useMemo(
    () => (users.data ?? []).filter((user) => matchesFilters(user, filters)).sort((a, b) => compareUsers(a, b, sort)),
    [users.data, filters, sort]
  );
  const pageUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasActiveFilters =
    filters.search.trim() !== '' || filters.roleId !== ALL || filters.departmentId !== ALL || filters.status !== ALL;

  useEffect(() => setPage(1), [filters]);

  const updateFilter = <Field extends keyof UserFilters>(field: Field, value: UserFilters[Field]) =>
    setFilters((current) => ({ ...current, [field]: value }));

  const handleSort = (key: UserSortKey) =>
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));

  const handleSaved = (message: string) => {
    setIsCreateOpen(false);
    setUserToEdit(null);
    setUserForRole(null);
    setUserForStatus(null);
    setSuccessMessage(message);
    users.reload();
  };

  const columns: DataTableColumn<Profile, UserSortKey>[] = [
    {
      id: 'name',
      header: 'Utilizador',
      sortKey: 'name',
      render: (user) => (
        <Link to={`/users/${user.id}`} className="flex items-center gap-3 hover:underline">
          <UserAvatar name={user.full_name} size="sm" />
          <span>
            <span className="block font-semibold text-text">{user.full_name}</span>
            <span className="block text-xs text-text-muted">{user.employee_number}</span>
          </span>
        </Link>
      ),
    },
    { id: 'email', header: 'E-mail', render: (user) => user.email },
    { id: 'department', header: 'Departamento', render: (user) => user.department?.name ?? 'Sem departamento' },
    { id: 'role', header: 'Perfil', render: (user) => user.role?.name ?? 'Sem perfil' },
    {
      id: 'status',
      header: 'Estado',
      render: (user) => <StatusBadge status={user.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />,
    },
    {
      id: 'lastLogin',
      header: 'Último acesso',
      sortKey: 'lastLogin',
      render: (user) => formatDateTime(user.last_login_at, 'Nunca acedeu'),
    },
    {
      id: 'actions',
      header: 'Ações',
      align: 'right',
      hideLabelOnMobile: true,
      render: (user) => {
        const isCurrentUser = user.id === currentUser?.id;
        return (
          <div className="flex justify-end gap-1">
            <Link
              to={`/users/${user.id}`}
              aria-label={`Ver ficha de ${user.full_name}`}
              title="Ver ficha"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
            </Link>
            {canUpdate && (
              <IconButton icon={Pencil} label={`Editar ${user.full_name}`} onClick={() => setUserToEdit(user)} />
            )}
            {canAssignRole && (
              <IconButton
                icon={Shield}
                label={`Alterar perfil de acesso de ${user.full_name}`}
                onClick={() => setUserForRole(user)}
              />
            )}
            {canChangeStatus && !isCurrentUser && (
              <IconButton
                icon={user.is_active ? UserX : UserCheck}
                tone={user.is_active ? 'danger' : 'neutral'}
                label={`${user.is_active ? 'Desativar' : 'Ativar'} ${user.full_name}`}
                onClick={() => setUserForStatus(user)}
              />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilizadores"
        subtitle="Contas, perfis de acesso e departamentos dos colaboradores."
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setIsCreateOpen(true)} disabled={!referenceData.data}>
              Novo utilizador
            </Button>
          )
        }
      />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {referenceData.error && <ErrorState message={referenceData.error} onRetry={referenceData.reload} />}

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            label="Pesquisar nome, e-mail ou nº"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
          />
          <FilterSelect label="Filtrar por perfil" value={filters.roleId} onChange={(event) => updateFilter('roleId', event.target.value)}>
            <option value={ALL}>Todos os perfis</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Filtrar por departamento"
            value={filters.departmentId}
            onChange={(event) => updateFilter('departmentId', event.target.value)}
          >
            <option value={ALL}>Todos os departamentos</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Filtrar por estado"
            value={filters.status}
            onChange={(event) => isStatusFilter(event.target.value) && updateFilter('status', event.target.value)}
          >
            <option value={ALL}>Todos os estados</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
          </FilterSelect>
        </div>

        {users.error && (
          <div className="p-4">
            <ErrorState message={users.error} onRetry={users.reload} />
          </div>
        )}
        {users.isLoading && !users.data && <LoadingState label="A carregar utilizadores..." />}

        {users.data && filteredUsers.length === 0 && (
          <EmptyState
            bordered={false}
            icon={Users}
            title={hasActiveFilters ? 'Nenhum utilizador corresponde aos filtros.' : 'Nenhum utilizador encontrado.'}
            action={
              hasActiveFilters && (
                <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Limpar filtros
                </Button>
              )
            }
          />
        )}

        {filteredUsers.length > 0 && (
          <>
            <DataTable
              caption="Lista de utilizadores"
              columns={columns}
              rows={pageUsers}
              getRowKey={(user) => user.id}
              sort={sort}
              onSortChange={handleSort}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={filteredUsers.length} onPageChange={setPage} />
          </>
        )}
      </Panel>

      <UserFormModal
        isOpen={isCreateOpen || Boolean(userToEdit)}
        user={userToEdit}
        departments={departments}
        roles={roles}
        canAssignAdmin={canAssignAdmin}
        onClose={() => {
          setIsCreateOpen(false);
          setUserToEdit(null);
        }}
        onSaved={handleSaved}
      />
      <RoleAssignModal
        user={userForRole}
        roles={roles}
        canAssignAdmin={canAssignAdmin}
        onClose={() => setUserForRole(null)}
        onSaved={handleSaved}
      />
      <UserStatusDialog user={userForStatus} onClose={() => setUserForStatus(null)} onSaved={handleSaved} />
    </div>
  );
};
