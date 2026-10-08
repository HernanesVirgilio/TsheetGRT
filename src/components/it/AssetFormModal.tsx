import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { createAsset, updateAsset } from '../../services/itAssetService';
import type { Department, Profile } from '../../types';
import type { Asset } from '../../types/it';
import { ASSET_STATUSES, ASSET_TYPES, ASSIGNABLE_ASSET_STATUSES, isAssetStatus, isAssetType } from '../../types/it';
import type { AssetFormField, AssetFormValues } from '../../utils/it';
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS, toLocalDateInput, validateAssetForm } from '../../utils/it';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors, optionalText } from '../../utils/validation';

const EMPTY_FORM: AssetFormValues = {
  assetTag: '',
  assetType: '',
  brand: '',
  model: '',
  serialNumber: '',
  status: 'IN_STOCK',
  assignedTo: '',
  departmentId: '',
  location: '',
  acquiredOn: '',
  notes: '',
};

function toFormValues(asset: Asset): AssetFormValues {
  return {
    assetTag: asset.assetTag,
    assetType: asset.assetType,
    brand: asset.brand ?? '',
    model: asset.model ?? '',
    serialNumber: asset.serialNumber ?? '',
    status: asset.status,
    assignedTo: asset.assignedTo ?? '',
    departmentId: asset.departmentId ?? '',
    location: asset.location ?? '',
    acquiredOn: asset.acquiredOn ?? '',
    notes: asset.notes,
  };
}

interface AssetFormModalProps {
  isOpen: boolean;
  /** Null = novo equipamento. */
  asset: Asset | null;
  users: Profile[];
  departments: Department[];
  onClose: () => void;
  onSaved: (message: string, assetId: string) => void;
}

export const AssetFormModal: React.FC<AssetFormModalProps> = ({ isOpen, asset, users, departments, onClose, onSaved }) => {
  const [values, setValues] = useState<AssetFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<AssetFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(asset ? toFormValues(asset) : EMPTY_FORM);
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, asset]);

  const updateValue = (field: AssetFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const canHaveAssignee = (ASSIGNABLE_ASSET_STATUSES as readonly string[]).includes(values.status);
  // Utilizadores ativos, mais o atual responsável (mesmo que entretanto desativado) para não o perder da lista.
  const assignableUsers = users.filter((user) => user.is_active || user.id === asset?.assignedTo);
  const selectableDepartments = departments.filter(
    (department) => department.active || department.id === asset?.departmentId
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateAssetForm(values, toLocalDateInput(new Date()));
    setFieldErrors(errors);
    if (hasErrors(errors) || !isAssetType(values.assetType) || !isAssetStatus(values.status)) return;

    const input = {
      assetTag: optionalText(values.assetTag.toUpperCase()),
      assetType: values.assetType,
      brand: optionalText(values.brand),
      model: optionalText(values.model),
      serialNumber: optionalText(values.serialNumber),
      status: values.status,
      assignedTo: canHaveAssignee ? values.assignedTo || null : null,
      departmentId: values.departmentId || null,
      location: optionalText(values.location),
      acquiredOn: values.acquiredOn || null,
      notes: values.notes.trim(),
    };

    setIsSubmitting(true);
    try {
      if (asset) {
        await updateAsset(asset.id, input);
        onSaved(`Equipamento ${input.assetTag ?? asset.assetTag} atualizado.`, asset.id);
      } else {
        const assetId = await createAsset(input);
        onSaved('Equipamento registado.', assetId);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar o equipamento.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'asset-form';

  return (
    <Modal
      isOpen={isOpen}
      title={asset ? `Editar ${asset.assetTag}` : 'Novo equipamento'}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {asset ? 'Guardar alterações' : 'Registar equipamento'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Código patrimonial"
            maxLength={30}
            value={values.assetTag}
            error={fieldErrors.assetTag}
            hint={asset ? undefined : 'Vazio = gerado automaticamente (SI-IT-0001).'}
            onChange={(event) => updateValue('assetTag', event.target.value.toUpperCase())}
          />
          <SelectField
            label="Tipo"
            required
            value={values.assetType}
            error={fieldErrors.assetType}
            onChange={(event) => updateValue('assetType', event.target.value)}
          >
            <option value="">Selecione…</option>
            {ASSET_TYPES.map((type) => (
              <option key={type} value={type}>
                {ASSET_TYPE_LABELS[type]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Marca"
            maxLength={100}
            value={values.brand}
            error={fieldErrors.brand}
            onChange={(event) => updateValue('brand', event.target.value)}
          />
          <TextField
            label="Modelo"
            maxLength={150}
            value={values.model}
            error={fieldErrors.model}
            onChange={(event) => updateValue('model', event.target.value)}
          />
          <TextField
            label="Número de série"
            maxLength={100}
            value={values.serialNumber}
            error={fieldErrors.serialNumber}
            onChange={(event) => updateValue('serialNumber', event.target.value)}
          />
          <TextField
            label="Data de aquisição"
            type="date"
            value={values.acquiredOn}
            error={fieldErrors.acquiredOn}
            onChange={(event) => updateValue('acquiredOn', event.target.value)}
          />
          <SelectField
            label="Estado"
            required
            value={values.status}
            error={fieldErrors.status}
            onChange={(event) => updateValue('status', event.target.value)}
          >
            {ASSET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ASSET_STATUS_LABELS[status]}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Utilizador responsável"
            value={canHaveAssignee ? values.assignedTo : ''}
            disabled={!canHaveAssignee}
            error={fieldErrors.assignedTo}
            hint={canHaveAssignee ? undefined : 'Equipamentos em stock ou abatidos não têm utilizador.'}
            onChange={(event) => updateValue('assignedTo', event.target.value)}
          >
            <option value="">Sem utilizador</option>
            {assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name}
                {user.is_active ? '' : ' (inativo)'}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Departamento"
            value={values.departmentId}
            onChange={(event) => updateValue('departmentId', event.target.value)}
          >
            <option value="">Sem departamento</option>
            {selectableDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Localização"
            maxLength={150}
            value={values.location}
            error={fieldErrors.location}
            hint="Ex.: Sede · Piso 2 · Sala 204"
            onChange={(event) => updateValue('location', event.target.value)}
          />
        </div>
        <TextAreaField
          label="Observações"
          rows={3}
          maxLength={2000}
          value={values.notes}
          onChange={(event) => updateValue('notes', event.target.value)}
        />
      </form>
    </Modal>
  );
};
