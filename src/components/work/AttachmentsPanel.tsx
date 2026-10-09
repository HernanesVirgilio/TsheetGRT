import React, { useRef, useState } from 'react';
import { ExternalLink, Paperclip, Trash2, Upload } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { getAttachmentUrl, listAttachments, removeAttachment, uploadAttachment } from '../../services/work/attachmentService';
import type { Attachment, AttachmentEntityType } from '../../types/work';
import { Panel } from '../ui/Panel';
import { Button, IconButton } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { ErrorState, LoadingState } from '../ui/States';
import { TicketNoteModal } from '../it/TicketActionModals';
import { formatDateTime } from '../../utils/format';
import { formatFileSize } from '../../utils/work';

interface AttachmentsPanelProps {
  entityType: AttachmentEntityType;
  entityId: string;
  viewerId: string;
  /** O registo está aberto e o utilizador trabalha nele (o servidor volta a validar). */
  canUpload: boolean;
  /** Pode remover anexos de terceiros (TIMESHEET_ATTACHMENT_DELETE + gestão do registo). */
  canRemoveOthers: boolean;
  onChanged?: () => void;
}

/** Anexos num bucket privado: abrir gera um URL assinado de curta duração. */
export const AttachmentsPanel: React.FC<AttachmentsPanelProps> = ({ entityType, entityId, viewerId, canUpload, canRemoveOthers, onChanged }) => {
  const attachments = useAsyncData(() => listAttachments(entityType, entityId), [entityType, entityId]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);
  const [toRemove, setToRemove] = useState<Attachment | null>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsUploading(true);
    setMessage(null);
    try {
      await uploadAttachment(entityType, entityId, file);
      setMessage({ variant: 'success', text: `"${file.name}" anexado.` });
      attachments.reload();
      onChanged?.();
    } catch (error) {
      setMessage({ variant: 'error', text: getErrorMessage(error, 'Não foi possível anexar o ficheiro.') });
    } finally {
      setIsUploading(false);
    }
  };

  const openAttachment = async (attachment: Attachment) => {
    setMessage(null);
    try {
      const url = await getAttachmentUrl(attachment.storagePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setMessage({ variant: 'error', text: getErrorMessage(error, 'Não foi possível abrir o anexo.') });
    }
  };

  const items = attachments.data ?? [];

  return (
    <Panel
      title="Anexos"
      description="Documentos e imagens até 10 MB. Os ficheiros são privados."
      flush
    >
      {message && (
        <div className="p-4 pb-0">
          <Alert variant={message.variant} onDismiss={() => setMessage(null)}>
            {message.text}
          </Alert>
        </div>
      )}
      {attachments.error && (
        <div className="p-4">
          <ErrorState message={attachments.error} onRetry={attachments.reload} />
        </div>
      )}
      {attachments.isLoading && !attachments.data && <LoadingState label="A carregar anexos..." />}
      {attachments.data && items.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">Sem anexos.</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-border">
          {items.map((attachment) => {
            const canRemove = (attachment.uploadedBy === viewerId && canUpload) || canRemoveOthers;
            return (
              <li key={attachment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Paperclip className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{attachment.fileName}</p>
                    <p className="text-xs text-text-muted">
                      {formatFileSize(attachment.sizeBytes)} · {formatDateTime(attachment.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton icon={ExternalLink} label={`Abrir ${attachment.fileName}`} onClick={() => openAttachment(attachment)} />
                  {canRemove && (
                    <IconButton icon={Trash2} tone="danger" label={`Remover ${attachment.fileName}`} onClick={() => setToRemove(attachment)} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canUpload && (
        <div className="border-t border-border px-5 py-3">
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            aria-label="Escolher ficheiro para anexar"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv"
            onChange={handleFile}
          />
          <Button size="sm" variant="secondary" icon={Upload} isLoading={isUploading} onClick={() => fileInput.current?.click()}>
            Anexar ficheiro
          </Button>
        </div>
      )}

      <TicketNoteModal
        isOpen={toRemove !== null}
        title="Remover anexo"
        description={toRemove ? `"${toRemove.fileName}" deixa de estar acessível. O registo da remoção fica no histórico.` : undefined}
        note={
          toRemove && toRemove.uploadedBy !== viewerId
            ? { label: 'Motivo da remoção', minLength: 5, maxLength: 1000 }
            : { label: 'Motivo (opcional)', maxLength: 1000 }
        }
        confirmLabel="Remover"
        variant="danger"
        onClose={() => setToRemove(null)}
        onConfirm={async (reason) => {
          if (!toRemove) return;
          await removeAttachment(toRemove.id, reason);
          setToRemove(null);
          setMessage({ variant: 'success', text: 'Anexo removido.' });
          attachments.reload();
          onChanged?.();
        }}
      />
    </Panel>
  );
};
