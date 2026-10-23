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
}, businessName: string = 'Lok8 Brookside'): string {
  const isVisitBooked = lead.appointmentStatus && lead.appointmentStatus !== 'None';
  const displayName = lead.name && lead.name !== 'Anonymous' ? lead.name : 'सर / मॅडम';

  if (isVisitBooked) {
    return (
      `नमस्कार ${displayName}!\n` +
      `${businessName} कडून मी प्रिया.\n\n` +
      `आपल्या संभाषणाप्रमाणे मी आपल्याला ११० एकर भव्य टाउनशिपचे ब्रोशर, लेआउट प्लॅन आणि साईट लोकेशन पाठवत आहे.\n\n` +
      `🏡 आपली साईट व्हिजिट: ${lead.appointmentStatus}\n` +
      `📍 साईट लोकेशन: https://maps.google.com/?q=Lok8+Brookside+South+Nagpur\n\n` +
      `काही शंका किंवा बदल असल्यास नक्की सांगा. धन्यवाद!`
    );
  }

  return (
    `नमस्कार ${displayName}!\n` +
    `${businessName} कडून मी प्रिया.\n\n` +
    `साऊथ नागपूरमधील उमरेड रोड / आऊटर रिंग रोड जवळील ११० एकर भव्य टाउनशिपचे (${businessName}) ब्रोशर, लेआउट प्लॅन आणि सविस्तर माहिती आपल्या माहितीसाठी पाठवत आहे.\n\n` +
    `📍 साईट लोकेशन: https://maps.google.com/?q=Lok8+Brookside+South+Nagpur\n\n` +
    `अधिक माहितीसाठी आपण कधीही संपर्क करू शकता. धन्यवाद!`
  );
}

export function buildWhatsAppUrl(lead: {
  name: string;
  phone?: string | null;
  appointmentStatus?: string | null;
  requirement?: string | null;
  budget?: string | null;
}, businessName: string = 'Lok8 Brookside'): string {
  const phone = getCleanWhatsAppPhone(lead.phone);
  if (!phone) return '#';
  const text = generateWhatsAppLeadMessage(lead, businessName);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
