import { createHash, randomBytes } from 'node:crypto';
import type { SupportTicket } from '@ai-receptionist/contracts';

export const hashSupportToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newSupportToken = () => randomBytes(32).toString('base64url');
export const validSupportToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
export function customerSupportView(ticket: any): SupportTicket {
  return {
    id: ticket.id,
    ticket_number: ticket.ticket_number,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    ...(ticket.messages
      ? {
          messages: ticket.messages
            .filter((message: any) => !message.is_internal)
            .map((message: any) => ({
              id: message.id,
              body: message.body,
              sender_type: message.sender_type,
              sender_name: message.sender_type === 'admin' ? 'Support team' : message.sender_name,
              is_internal: false,
              created_at: message.created_at,
              attachments: (message.attachments ?? []).map((file: any) => ({
                id: file.id,
                file_name: file.file_name,
                file_size: file.file_size,
                content_type: file.content_type,
              })),
            })),
        }
      : {}),
  };
}

export function supportBytesMatch(buffer: Buffer, mime: string) {
  if (mime === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png')
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return (
    mime === 'image/webp' &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}
