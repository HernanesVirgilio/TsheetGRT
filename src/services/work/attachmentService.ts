import { supabase } from '../../lib/supabase/client';
import { ServiceError, toServiceError } from '../../lib/errors';
import type { Attachment, AttachmentEntityType } from '../../types/work';

/**
 * Anexos no bucket privado "work-attachments". O carregamento tem três passos:
 *   1. register_attachment valida a permissão e reserva o caminho no servidor;
 *   2. o ficheiro é enviado para esse caminho (a política do Storage só aceita caminhos reservados);
 *   3. confirm_attachment confirma que o ficheiro existe e regista o evento no histórico.
 * Os ficheiros nunca são públicos: a leitura usa URLs assinados de curta duração.
 */

const BUCKET = 'work-attachments';
const SIGNED_URL_SECONDS = 120;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export async function listAttachments(entityType: AttachmentEntityType, entityId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('id, file_name, mime_type, size_bytes, storage_path, uploaded_by, created_at, upload_confirmed_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .not('upload_confirmed_at', 'is', null)
    .order('created_at');
  if (error) throw toServiceError(error, 'Não foi possível carregar os anexos.');
  return data.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }));
}

export function validateAttachmentFile(file: File): string | null {
  if (file.size === 0) return 'O ficheiro está vazio.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'O ficheiro tem de ter no máximo 10 MB.';
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return 'Tipo de ficheiro não permitido. Use imagens, PDF, documentos Office, texto ou CSV.';
  }
  return null;
}

export async function uploadAttachment(entityType: AttachmentEntityType, entityId: string, file: File): Promise<void> {
  const validationError = validateAttachmentFile(file);
  if (validationError) throw new ServiceError(validationError);

  const registration = await supabase.rpc('register_attachment', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_file_name: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });
  if (registration.error) throw toServiceError(registration.error, 'Não foi possível preparar o anexo.');
  const reserved = registration.data[0];
  if (!reserved) throw new ServiceError('Não foi possível preparar o anexo.');

  const upload = await supabase.storage.from(BUCKET).upload(reserved.storage_path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw new ServiceError('Não foi possível carregar o ficheiro. Tente novamente.');

  const confirmation = await supabase.rpc('confirm_attachment', { p_attachment_id: reserved.attachment_id });
  if (confirmation.error) throw toServiceError(confirmation.error, 'Não foi possível confirmar o anexo.');
}

/** URL assinado de curta duração; só é emitido se a política do Storage permitir a leitura. */
export async function getAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  if (error || !data) throw new ServiceError('Não foi possível abrir o anexo.');
  return data.signedUrl;
}

export async function removeAttachment(attachmentId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('remove_attachment', { p_attachment_id: attachmentId, p_reason: reason });
  if (error) throw toServiceError(error, 'Não foi possível remover o anexo.');
}
