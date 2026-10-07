import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import { updateOwnPhone } from '../../services/userService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { formatDateTime } from '../../utils/format';
import { optionalText } from '../../utils/validation';

const MAX_PHONE_LENGTH = 50;

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-text">{children}</dd>
  </div>
);

export const ProfilePage: React.FC = () => {
  const { currentUser, refreshProfile } = useAuth();
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!currentUser) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (phone.trim().length > MAX_PHONE_LENGTH) {
      setErrorMessage(`O telefone não pode exceder ${MAX_PHONE_LENGTH} carateres.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await updateOwnPhone(currentUser.id, optionalText(phone));
      await refreshProfile();
      setSuccessMessage('Contacto atualizado com sucesso.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível atualizar o contacto.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Meu perfil"
        subtitle="Dados institucionais e contactos da sua conta."
        actions={
          <Link
            to="/alterar-palavra-passe"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border-input bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Alterar palavra-passe
          </Link>
        }
      />

      <Panel>
        <div className="mb-5 flex items-center gap-4">
          <UserAvatar name={currentUser.full_name} size="lg" />
          <div>
            <p className="text-base font-semibold text-text">{currentUser.full_name}</p>
            <p className="text-sm text-text-secondary">{currentUser.job_title ?? 'Sem cargo definido'}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={currentUser.is_active ? 'ACTIVE' : 'INACTIVE'} />
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <DetailItem label="E-mail">{currentUser.email}</DetailItem>
          <DetailItem label="Nº de colaborador">{currentUser.employee_number ?? '—'}</DetailItem>
          <DetailItem label="Departamento">{currentUser.department?.name ?? 'Sem departamento'}</DetailItem>
          <DetailItem label="Perfil de acesso">{currentUser.role?.name ?? 'Sem perfil'}</DetailItem>
          <DetailItem label="Último acesso">{formatDateTime(currentUser.last_login_at, 'Sessão atual')}</DetailItem>
        </dl>
        <p className="mt-4 text-sm text-text-muted">
          Os dados institucionais são geridos pela administração. Pode atualizar o seu contacto telefónico.
        </p>
      </Panel>

      <Panel title="Contacto telefónico">
        <form onSubmit={handleSubmit} className="max-w-md space-y-4" noValidate>
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          <TextField
            label="Telefone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Button type="submit" isLoading={isSubmitting}>
            Guardar contacto
          </Button>
        </form>
      </Panel>
    </div>
  );
};
