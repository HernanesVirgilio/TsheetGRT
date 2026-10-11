import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Pencil, Plus, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import {
  countActiveUsersByDepartment,
  createDepartment,
  listDepartments,
  setDepartmentActive,
  updateDepartment,
} from '../../services/departmentService';
import type { Department } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { TextAreaField, TextField } from '../../components/ui/FormField';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, pluralize } from '../../utils/format';
import type { DepartmentFormField, DepartmentFormValues, FieldErrors } from '../../utils/validation';
import { hasErrors, normalizeDepartmentCode, validateDepartmentForm } from '../../utils/validation';
import { t } from '../../lib/i18n';

interface DepartmentFormModalProps {
  isOpen: boolean;
  department: Department | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const EMPTY_FORM: DepartmentFormValues = { code: '', name: '', description: '' };

const DepartmentFormModal: React.FC<DepartmentFormModalProps> = ({ isOpen, department, onClose, onSaved }) => {
  const [values, setValues] = useState<DepartmentFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<DepartmentFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(department ? { code: department.code, name: department.name, description: department.description } : EMPTY_FORM);
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, department]);

  const updateValue = (field: DepartmentFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateDepartmentForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);
    try {
      const payload = { name: values.name.trim(), description: values.description.trim() };
      if (department) {
        await updateDepartment(department.id, payload);
        onSaved(t('Departamento {name} atualizado com sucesso.', { name: payload.name }));
      } else {
        await createDepartment({ ...payload, code: normalizeDepartmentCode(values.code) });
        onSaved(t('Departamento {name} criado com sucesso.', { name: payload.name }));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar o departamento.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'department-form';

  return (
    <Modal
      isOpen={isOpen}
      title={department ? t('Editar departamento') : t('Novo departamento')}
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {t('Guardar')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField
          label={t('Código')}
          required
          disabled={Boolean(department)}
          value={values.code}
          error={fieldErrors.code}
          hint={department ? t('O código não pode ser alterado.') : t('Ex.: FIN, RH, OPS. Não pode ser alterado depois.')}
          className="font-mono uppercase"
          onChange={(event) => updateValue('code', event.target.value.toUpperCase())}
        />
        <TextField
          label={t('Nome')}
          required
          value={values.name}
          error={fieldErrors.name}
          onChange={(event) => updateValue('name', event.target.value)}
        />
        <TextAreaField
          label={t('Descrição')}
          rows={3}
          value={values.description}
          onChange={(event) => updateValue('description', event.target.value)}
        />
      </form>
    </Modal>
  );
};

export const DepartmentsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('DEPARTMENTS_MANAGE');
  const departments = useAsyncData(listDepartments, []);
  const userCounts = useAsyncData(countActiveUsersByDepartment, []);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [departmentToEdit, setDepartmentToEdit] = useState<Department | null>(null);
  const [departmentToToggle, setDepartmentToToggle] = useState<Department | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const activeUsersIn = (department: Department) => userCounts.data?.get(department.id) ?? 0;

  const handleSaved = (message: string) => {
    setIsFormOpen(false);
    setDepartmentToEdit(null);
    setSuccessMessage(message);
    departments.reload();
  };

  const handleToggle = async () => {
    if (!departmentToToggle) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      await setDepartmentActive(departmentToToggle.id, !departmentToToggle.active);
      setSuccessMessage(
        departmentToToggle.active ? t('Departamento {name} desativado com sucesso.', { name: departmentToToggle.name }) : t('Departamento {name} ativado com sucesso.', { name: departmentToToggle.name })
      );
      setDepartmentToToggle(null);
      departments.reload();
    } catch (error) {
      setToggleError(getErrorMessage(error, t('Não foi possível alterar o estado do departamento.')));
    } finally {
      setIsToggling(false);
    }
  };

  const columns: DataTableColumn<Department>[] = [
    { id: 'code', header: t('Código'), render: (department) => <span className="font-mono font-semibold text-text">{department.code}</span> },
    { id: 'name', header: t('Nome'), render: (department) => <span className="font-medium text-text">{department.name}</span> },
    { id: 'description', header: t('Descrição'), className: 'max-w-sm', render: (department) => department.description || '—' },
    {
      id: 'users',
      header: t('Utilizadores ativos'),
      render: (department) => (userCounts.data ? activeUsersIn(department) : '—'),
    },
    {
      id: 'status',
      header: t('Estado'),
      render: (department) => <StatusBadge status={department.active ? 'ACTIVE' : 'INACTIVE'} size="sm" />,
    },
    { id: 'created', header: t('Criado em'), render: (department) => formatDate(department.created_at) },
  ];

  if (canManage) {
    columns.push({
      id: 'actions',
      header: t('Ações'),
      align: 'right',
      hideLabelOnMobile: true,
      render: (department) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icon={Pencil}
            label={t('Editar {name}', { name: department.name })}
            onClick={() => {
              setDepartmentToEdit(department);
              setIsFormOpen(true);
            }}
          />
          <IconButton
            icon={department.active ? XCircle : CheckCircle2}
            tone={department.active ? 'danger' : 'neutral'}
            label={`${department.active ? 'Desativar' : 'Ativar'} ${department.name}`}
            onClick={() => {
              setToggleError(null);
              setDepartmentToToggle(department);
            }}
          />
        </div>
      ),
    });
  }

  const toggleUsers = departmentToToggle ? activeUsersIn(departmentToToggle) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Departamentos')}
        subtitle={t('Estrutura organizacional da SI Holdings.')}
        actions={
          canManage && (
            <Button
              icon={Plus}
              onClick={() => {
                setDepartmentToEdit(null);
                setIsFormOpen(true);
              }}
            >
              {t('Novo departamento')}
            </Button>
          )
        }
      />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      <Panel flush>
        {departments.error && (
          <div className="p-4">
            <ErrorState message={departments.error} onRetry={departments.reload} />
          </div>
        )}
        {departments.isLoading && !departments.data && <LoadingState label={t('A carregar departamentos...')} />}
        {departments.data?.length === 0 && (
          <EmptyState bordered={false} icon={Building2} title={t('Nenhum departamento encontrado.')} />
        )}
        {departments.data && departments.data.length > 0 && (
          <DataTable
            caption={t('Lista de departamentos')}
            columns={columns}
            rows={departments.data}
            getRowKey={(department) => department.id}
          />
        )}
      </Panel>

      <DepartmentFormModal
        isOpen={isFormOpen}
        department={departmentToEdit}
        onClose={() => {
          setIsFormOpen(false);
          setDepartmentToEdit(null);
        }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        isOpen={Boolean(departmentToToggle)}
        title={departmentToToggle?.active ? t('Desativar departamento?') : t('Ativar departamento?')}
        message={
          departmentToToggle?.active
            ? [
                t('{name} deixará de poder ser atribuído a utilizadores.', { name: departmentToToggle.name }),
                toggleUsers > 0
                  ? t('Tem {users}, que mantêm a associação atual.', { users: pluralize(toggleUsers, 'utilizador ativo', 'utilizadores ativos') })
                  : '',
              ]
                .filter(Boolean)
                .join(' ')
            : t('{name} voltará a estar disponível para atribuição.', { name: departmentToToggle?.name })
        }
        confirmLabel={departmentToToggle?.active ? 'Desativar' : 'Ativar'}
        variant={departmentToToggle?.active ? 'danger' : 'primary'}
        isLoading={isToggling}
        errorMessage={toggleError}
        onConfirm={handleToggle}
        onCancel={() => setDepartmentToToggle(null)}
      />
    </div>
  );
};
