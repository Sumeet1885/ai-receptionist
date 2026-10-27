import { validateContactInput } from './validation/contact';

export const SUPPORT_STATUSES = ['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed'] as const;
export const SUPPORT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export interface SupportCategory {
  id: string;
  name: string;
  defaultPriority: SupportPriority;
  archived?: boolean;
}
export const SUPPORT_CATEGORIES: SupportCategory[] = [
  { id: 'billing', name: 'Billing & payment', defaultPriority: 'high' },
  { id: 'bug_report', name: 'Bug report', defaultPriority: 'high' },
  { id: 'feature_request', name: 'Feature request', defaultPriority: 'low' },
  { id: 'account_issue', name: 'Account & login', defaultPriority: 'high' },
  { id: 'technical_support', name: 'Technical support', defaultPriority: 'medium' },
  { id: 'general', name: 'General inquiry', defaultPriority: 'low' },
];
export interface SupportInput {
  name: string;
  email: string;
  phone: string;
  subject: string;
  category: string;
  description: string;
}
export interface SupportAttachment {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
}
export interface SupportMessage {
  id: string;
  body: string;
  sender_type: 'customer' | 'admin';
  sender_name: string;
  is_internal: boolean;
  created_at: string;
  attachments: SupportAttachment[];
}
export interface SupportTicket {
  id: string;
  ticket_number: number;
  subject: string;
  category: string;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  messages?: SupportMessage[];
  name?: string;
  email?: string;
  phone?: string;
  priority?: SupportPriority;
  admin_unread?: boolean;
  assigned_admin_id?: string | null;
}
export const supportNumber = (number: number) => `SUP-${String(number).padStart(6, '0')}`;
export const supportLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
export const SUPPORT_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf';
export const SUPPORT_LIMITS = {
  name: { min: 2, max: 70 },
  email: { max: 254 },
  phone: { max: 25 },
  subject: { max: 150 },
  description: { min: 10, max: 5000 },
  reply: { min: 1, max: 5000 },
} as const;
export function supportFileError(
  files: ArrayLike<{ name: string; size: number; type: string }>,
  creating: boolean,
) {
  if (files.length > (creating ? 1 : 3))
    return creating ? 'Attach only one file.' : 'Attach up to three files.';
  for (const file of Array.from(files)) {
    if (file.size < 1) return 'Attachments cannot be empty.';
    if (
      !/\.(jpe?g|png|webp|pdf)$/i.test(file.name) ||
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)
    )
      return 'Only JPG, PNG, WEBP and PDF files are allowed.';
    if (file.size > (creating ? 2 : 10) * 1024 * 1024)
      return creating
        ? 'The attachment must be 2 MB or smaller.'
        : 'Each attachment must be 10 MB or smaller.';
  }
  return '';
}
export function validateSupport(input: Partial<SupportInput>, guest: boolean) {
  const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '');
  const value: SupportInput = {
    name: text(input.name),
    email: text(input.email).toLowerCase(),
    phone: text(input.phone),
    subject: text(input.subject),
    category: text(input.category),
    description: text(input.description),
  };
  const errors: Record<string, string> = {};
  if (guest) {
    if (value.name.length < SUPPORT_LIMITS.name.min || value.name.length > SUPPORT_LIMITS.name.max)
      errors.name = 'Enter a name between 2 and 70 characters.';
    if (!validateContactInput('email', value.email).valid) errors.email = 'Enter a valid email address.';
    if (value.phone.length > SUPPORT_LIMITS.phone.max || !validateContactInput('phone', value.phone).valid)
      errors.phone = 'Enter a valid phone number with country code.';
  }
  if (value.subject.length > SUPPORT_LIMITS.subject.max) errors.subject = 'Use at most 150 characters.';
  if (!value.category || value.category.length > 50) errors.category = 'Choose a category.';
  if (
    value.description.length < SUPPORT_LIMITS.description.min ||
    value.description.length > SUPPORT_LIMITS.description.max
  )
    errors.description = 'Describe your issue in 10 to 5,000 characters.';
  return { value, errors, ok: Object.keys(errors).length === 0 };
}
