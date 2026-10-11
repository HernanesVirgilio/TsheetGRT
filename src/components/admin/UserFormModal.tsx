import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { createUser, updateUser } from '../../services/userService';
import type { Department, Profile, Role, RoleCode } from '../../types';
import type { FieldErrors, UserFormField, UserFormValues } from '../../utils/validation';
import { hasErrors, optionalText, validateUserForm } from '../../utils/validation';
import { t } from '../../lib/i18n';

const DEFAULT_ROLE: RoleCode = 'EMPLOYEE';

interface UserFormModalProps {
  isOpen: boolean;
  /** Ausente = criação de um novo utilizador. */
  user?: Profile | null;
  departments: Department[];
  roles: Role[];
  canAssignAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function initialValues(user?: Profile | null): UserFormValues {
  return {
    fullName: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    departmentId: user?.department_id ?? '',
    jobTitle: user?.job_title ?? '',
  };
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  user,
  departments,
  roles,
  canAssignAdmin,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(user);
  const [values, setValues] = useState<UserFormValues>(initialValues(user));
  const [roleCode, setRoleCode] = useState<RoleCode>(DEFAULT_ROLE);
  const [jobDescription, setJobDescription] = useState(user?.job_description ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<UserFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues(user));
    setJobDescription(user?.job_description ?? '');
    setRoleCode(DEFAULT_ROLE);
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, user]);

  // Só departamentos ativos podem ser atribuídos; o atual mantém-se visível mesmo se inativo.
  const selectableDepartments = departments.filter(
    (department) => department.active || department.id === user?.department_id
  );
  const assignableRoles = roles.filter((role) => canAssignAdmin || role.code !== 'ADMIN');

  const updateValue = (field: UserFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateUserForm(values, { requireEmail: !isEditing });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);
    try {
      if (user) {
        await updateUser(user.id, {
          fullName: values.fullName.trim(),
          phone: optionalText(values.phone),
          departmentId: values.departmentId,
          jobTitle: optionalText(values.jobTitle),
          jobDescription: optionalText(jobDescription),
        });
        onSaved(t('Dados do utilizador atualizados com sucesso.'));
      } else {
        await createUser({
          fullName: values.fullName.trim(),
          email: values.email.trim().toLowerCase(),
          roleCode,
          departmentId: values.departmentId,
          jobTitle: optionalText(values.jobTitle),
          phone: optionalText(values.phone),
        });
        onSaved(t('Utilizador criado com sucesso. Foi enviado um convite para {email}.', { email: values.email.trim().toLowerCase() }));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar o utilizador.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'user-form';

  return (
    <Modal
      isOpen={isOpen}
      title={isEditing ? t('Editar utilizador') : t('Novo utilizador')}
      description={
        isEditing
          ? user?.email
          : t('O utilizador recebe um convite por e-mail e define a sua própria palavra-passe.')
      }
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {isEditing ? 'Guardar' : t('Criar e enviar convite')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

        <TextField
          label={t('Nome completo')}
          required
          autoComplete="off"
          value={values.fullName}
          error={fieldErrors.fullName}
          onChange={(event) => updateValue('fullName', event.target.value)}
        />

        {!isEditing && (
          <TextField
            label={t('E-mail institucional')}
            type="email"
            required
            autoComplete="off"
            value={values.email}
            error={fieldErrors.email}
            hint={t('Não pode ser alterado depois da criação.')}
            onChange={(event) => updateValue('email', event.target.value)}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label={t('Departamento')}
            required
            value={values.departmentId}
            error={fieldErrors.departmentId}
            onChange={(event) => updateValue('departmentId', event.target.value)}
          >
            <option value="">{t('Selecione…')}</option>
            {selectableDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
                {department.active ? '' : ' (inativo)'}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('Cargo')}
            value={values.jobTitle}
            error={fieldErrors.jobTitle}
            onChange={(event) => updateValue('jobTitle', event.target.value)}
          />
        </div>

        <TextField
          label={t('Telefone')}
          type="tel"
          autoComplete="off"
          value={values.phone}
          error={fieldErrors.phone}
          onChange={(event) => updateValue('phone', event.target.value)}
        />

        {isEditing && (
          <TextAreaField
            label={t('Descrição da função')}
            rows={3}
            maxLength={2000}
            value={jobDescription}
            hint={t('O que a pessoa faz e que responsabilidades pode receber. Não altera o perfil de acesso.')}
            onChange={(event) => setJobDescription(event.target.value)}
          />
        )}

        {!isEditing && (
          <SelectField
            label={t('Perfil de acesso')}
            required
            value={roleCode}
            onChange={(event) => {
              const selected = assignableRoles.find((role) => role.code === event.target.value);
              if (selected) setRoleCode(selected.code);
            }}
          >
            {assignableRoles.map((role) => (
              <option key={role.id} value={role.code}>
                {role.name} — {role.description}
              </option>
            ))}
          </SelectField>
        )}
      </form>
    </Modal>
  );
};
