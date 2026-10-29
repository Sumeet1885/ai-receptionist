import { Lead } from '../types';

export function getCleanWhatsAppPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return digits;
  return digits;
}

export function generateWhatsAppLeadMessage(lead: {
  name: string;
  phone?: string | null;
  appointmentStatus?: string | null;
  requirement?: string | null;
  budget?: string | null;
}, businessName: string = 'Our Team'): string {
  const isVisitBooked = lead.appointmentStatus && lead.appointmentStatus !== 'None';
  const displayName = lead.name && lead.name !== 'Anonymous' ? lead.name : 'there';

  if (isVisitBooked) {
    return (
      `Hello ${displayName}!\n\n` +
      `Thank you for speaking with ${businessName}. As discussed, here is your appointment confirmation:\n\n` +
      `📅 Scheduled Time: ${lead.appointmentStatus}\n` +
      (lead.requirement ? `📋 Purpose: ${lead.requirement}\n` : '') +
      `\nPlease feel free to reply directly to this message if you have any questions or wish to reschedule.\n\n` +
      `Best regards,\n${businessName}`
    );
  }

  return (
    `Hello ${displayName}!\n\n` +
    `Thank you for your interest in ${businessName}. Following up on our recent conversation, we are pleased to share more details with you.\n\n` +
    (lead.requirement ? `📋 Inquired: ${lead.requirement}\n` : '') +
    (lead.budget ? `💰 Budget: ${lead.budget}\n` : '') +
    `\nPlease let us know if you need any additional assistance. We are happy to help!\n\n` +
    `Best regards,\n${businessName}`
  );
}

export function buildWhatsAppUrl(lead: {
  name: string;
  phone?: string | null;
  appointmentStatus?: string | null;
  requirement?: string | null;
  budget?: string | null;
}, businessName: string = 'Our Team'): string {
  const phone = getCleanWhatsAppPhone(lead.phone);
  if (!phone) return '#';
  const text = generateWhatsAppLeadMessage(lead, businessName);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
