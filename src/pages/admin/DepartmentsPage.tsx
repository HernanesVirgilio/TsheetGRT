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
        onSaved(`Departamento ${payload.name} atualizado com sucesso.`);
      } else {
        await createDepartment({ ...payload, code: normalizeDepartmentCode(values.code) });
        onSaved(`Departamento ${payload.name} criado com sucesso.`);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar o departamento.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'department-form';

  return (
    <Modal
      isOpen={isOpen}
      title={department ? 'Editar departamento' : 'Novo departamento'}
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
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField
          label="Código"
          required
          disabled={Boolean(department)}
          value={values.code}
          error={fieldErrors.code}
          hint={department ? 'O código não pode ser alterado.' : 'Ex.: FIN, RH, OPS. Não pode ser alterado depois.'}
          className="font-mono uppercase"
          onChange={(event) => updateValue('code', event.target.value.toUpperCase())}
        />
        <TextField
          label="Nome"
          required
          value={values.name}
          error={fieldErrors.name}
          onChange={(event) => updateValue('name', event.target.value)}
        />
        <TextAreaField
          label="Descrição"
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
        `Departamento ${departmentToToggle.name} ${departmentToToggle.active ? 'desativado' : 'ativado'} com sucesso.`
      );
      setDepartmentToToggle(null);
      departments.reload();
    } catch (error) {
      setToggleError(getErrorMessage(error, 'Não foi possível alterar o estado do departamento.'));
    } finally {
      setIsToggling(false);
    }
  };

  const columns: DataTableColumn<Department>[] = [
    { id: 'code', header: 'Código', render: (department) => <span className="font-mono font-semibold text-text">{department.code}</span> },
    { id: 'name', header: 'Nome', render: (department) => <span className="font-medium text-text">{department.name}</span> },
    { id: 'description', header: 'Descrição', className: 'max-w-sm', render: (department) => department.description || '—' },
    {
      id: 'users',
      header: 'Utilizadores ativos',
      render: (department) => (userCounts.data ? activeUsersIn(department) : '—'),
    },
    {
      id: 'status',
      header: 'Estado',
      render: (department) => <StatusBadge status={department.active ? 'ACTIVE' : 'INACTIVE'} size="sm" />,
    },
    { id: 'created', header: 'Criado em', render: (department) => formatDate(department.created_at) },
  ];

  if (canManage) {
    columns.push({
      id: 'actions',
      header: 'Ações',
      align: 'right',
      hideLabelOnMobile: true,
      render: (department) => (
        <div className="flex justify-end gap-1">
          <IconButton
            icon={Pencil}
            label={`Editar ${department.name}`}
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
        title="Departamentos"
        subtitle="Estrutura organizacional da SI Holdings."
        actions={
          canManage && (
            <Button
              icon={Plus}
              onClick={() => {
                setDepartmentToEdit(null);
                setIsFormOpen(true);
              }}
            >
              Novo departamento
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
        {departments.isLoading && !departments.data && <LoadingState label="A carregar departamentos..." />}
        {departments.data?.length === 0 && (
          <EmptyState bordered={false} icon={Building2} title="Nenhum departamento encontrado." />
        )}
        {departments.data && departments.data.length > 0 && (
          <DataTable
            caption="Lista de departamentos"
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
        title={departmentToToggle?.active ? 'Desativar departamento?' : 'Ativar departamento?'}
        message={
          departmentToToggle?.active
            ? `${departmentToToggle.name} deixará de poder ser atribuído a utilizadores.${
                toggleUsers > 0
                  ? ` Tem ${pluralize(toggleUsers, 'utilizador ativo', 'utilizadores ativos')}, que mantêm a associação atual.`
                  : ''
              }`
            : `${departmentToToggle?.name} voltará a estar disponível para atribuição.`
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
