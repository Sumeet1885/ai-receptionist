import { siteOrigin } from './seo';
// Company and contact details match own-crm/apps/web/src/lib/legal.ts.
export const LEGAL = {
  brandName: 'Bolega India',
  legalEntity: 'AgileWaters LLC',
  attribution: 'Bolega India is a product built by AgileWaters LLC (CA, USA) in association with ACPL India.',
  email: 'Support@AgileWaters.com',
  phone: '+91 94218 09846',
  address:
    '6th Floor, Brand Square, 606, Kunal Icon Rd, Roseland Residency, Pimple Saudagar, Pimpri-Chinchwad, Maharashtra 411027',
  url: siteOrigin(import.meta.env?.VITE_SITE_URL),
  effectiveDate: 'October 27, 2026',
} as const;

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
}
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'overview',
    title: 'About this policy',
    paragraphs: [
      `This Privacy Policy explains how ${LEGAL.legalEntity} collects, uses and protects information when businesses, their customers and visitors use ${LEGAL.brandName} at ${LEGAL.url}. ${LEGAL.attribution}`,
      'Businesses use the service to configure an AI receptionist for calls and web chat, collect leads and manage appointments. When a business uses the service to handle its customer information, that business decides the purposes of that processing and is responsible for its own privacy notices and permissions.',
    ],
  },
  {
    id: 'information',
    title: 'Information we collect',
    items: [
      'Account and business details: your name, business name, email address, phone number, access requests and receptionist configuration.',
      'Conversations and leads: messages, call details, audio or recordings when enabled, transcripts, summaries, contact details and other information provided during calls and chats.',
      'Business knowledge: services, prices, hours, policies and other content you provide to help the receptionist answer questions.',
      'Connected services: calendar account information, availability, appointments and credentials needed to operate integrations you authorise.',
      'Billing records: selected plans, payment and order identifiers, amounts and payment status. Card and bank payment details are handled by the payment gateway, Razorpay.',
      'Support and security information: support tickets, replies, attachments, IP addresses, browser information and service logs used to operate and protect the platform.',
    ],
  },
  {
    id: 'use',
    title: 'How we use information',
    items: [
      'Provide and maintain AI calls, web chat, lead capture, conversation history and appointment features.',
      'Manage accounts, access requests, subscriptions, payments and usage limits.',
      'Send activation links, security notices, payment reminders and support updates.',
      'Respond to questions, investigate problems, prevent fraud and abuse, and improve service reliability.',
      'Meet applicable legal obligations and resolve disputes.',
    ],
  },
  {
    id: 'sharing',
    title: 'Service providers and data sharing',
    paragraphs: [
      'We do not sell your personal information. We share information with providers that help deliver the service, including hosting and database providers, AI and speech-processing providers, telephony providers, email services and our payment gateway. The information shared depends on the features and integrations you use.',
      'For example, providing an AI response may require processing conversation text or audio with an AI or voice provider. Connecting a calendar or phone provider authorises the exchanges needed for that integration. We may also disclose information when required by law or to protect the service and its users.',
      'Providers may process information in countries other than your own. Their services and the integrations you connect may also be governed by their own privacy notices.',
    ],
  },
  {
    id: 'calendars',
    title: 'Calendar integrations',
    paragraphs: [
      'Google and Microsoft calendar connections are optional. When you connect a calendar, we use the authorised permissions to check availability and manage appointments for your receptionist. This integration is for calendar functions; it does not provide a Gmail inbox integration.',
      'You can revoke integration access through the connected provider’s account permissions. Revoking access stops future authorised requests, but information already saved as a lead or appointment may remain in your workspace until it is removed or a deletion request is completed.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    paragraphs: [
      'We use authentication cookies or browser storage to keep account sessions working, and security tools such as Cloudflare Turnstile to protect public forms from automated abuse. These tools may process device and network information for security checks.',
      'You can control cookies and site storage through your browser. Blocking or clearing them may sign you out or prevent account and security features from working.',
    ],
  },
  {
    id: 'retention',
    title: 'Retention and security',
    paragraphs: [
      'We retain information as needed to provide the service, support your account, resolve issues and meet legal obligations. Retention depends on the type of record and the configured service settings. Finished support tickets and their attachments may be deleted under the support retention settings.',
      'We use technical and organisational measures intended to protect information, including authenticated access, permission checks and restricted access to support attachments. No method of transmission or storage is completely secure. Keep your credentials and private support links confidential.',
    ],
  },
  {
    id: 'rights',
    title: 'Your choices and requests',
    paragraphs: [
      'You may request access, correction, export or deletion of your information by contacting us. We may need to verify your identity and authority before completing a request. Some records may need to be retained for legal, payment, fraud-prevention or dispute-resolution purposes.',
      'If you contacted a business through its receptionist, contact that business first about the information it collected. We can help the business address requests relating to information processed through our service.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    paragraphs: [
      'We may update this policy as the service changes. The effective date above identifies the current version. We will provide additional notice where required.',
    ],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    title: 'About these terms',
    paragraphs: [
      `These Terms & Conditions govern your use of ${LEGAL.brandName}, an AI receptionist service operated by ${LEGAL.legalEntity}, available at ${LEGAL.url}. By creating an account or using the service, you agree to these terms. ${LEGAL.attribution}`,
      'If you use the service for a business, you confirm that you have authority to agree on its behalf.',
    ],
  },
  {
    id: 'account',
    title: 'Your account and responsibilities',
    items: [
      'Provide accurate account and business information, protect your login credentials and keep access limited to authorised people.',
      'You are responsible for activity under your account, the business information you provide and your receptionist’s configuration.',
      'Have the rights and permissions needed to upload business content, process customer information and connect external services.',
      'Do not use the service for fraud, impersonation, harassment, unlawful communications, security attacks or other abusive activity.',
    ],
  },
  {
    id: 'ai-calls',
    title: 'AI conversations and calling',
    paragraphs: [
      'AI responses may contain errors. Review your business knowledge, greetings, appointment rules and customer-facing configuration before use, and monitor important conversations. You remain responsible for business decisions, commitments and follow-up.',
      'You are responsible for applicable permissions, notices and consents for automated communications, outbound calls, recording, transcription and customer data processing, including any required AI disclosure and opt-out handling. Do not use the service to contact people unlawfully.',
      'The receptionist is not an emergency service and should not be relied on for emergency response or professional medical, legal or financial advice.',
    ],
  },
  {
    id: 'billing',
    title: 'Plans, usage and billing',
    items: [
      'Plan prices, included monthly minutes, agent limits, concurrent calls, setup fees and available add-ons are shown on the pricing page and at checkout.',
      'Paid plans are charged through Razorpay. A one-time setup fee may be collected with the first month where shown. Additional usage, top-ups or third-party phone services may involve separate charges.',
      'Your use is subject to the limits and duration of the purchased plan. Contact support about billing questions, cancellation or a refund request; any mandatory rights under applicable law continue to apply.',
      'Prices may change with prior notice. Changes do not alter an already-paid order or its current paid period.',
    ],
  },
  {
    id: 'integrations',
    title: 'Third-party services and availability',
    paragraphs: [
      'Some features depend on third-party AI, telephony, calendar, hosting and payment services. Those providers may have their own terms, charges and availability limits. You are responsible for the third-party accounts you connect.',
      'We work to keep the service available, but maintenance, network failures and third-party outages may interrupt it. Unless separately agreed in writing, we do not promise uninterrupted operation or a particular business outcome.',
    ],
  },
  {
    id: 'ownership',
    title: 'Ownership and business data',
    paragraphs: [
      `The software, design and service content of ${LEGAL.brandName} are owned by ${LEGAL.legalEntity} or its licensors. Your business data remains yours. You grant us the limited rights needed to process it and deliver the service.`,
      'Our Privacy Policy explains how information is handled. You must not upload content that infringes another person’s rights or disclose passwords, keys or other secrets in public-facing receptionist knowledge.',
    ],
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    paragraphs: [
      'The service is provided on an “as is” basis. To the maximum extent permitted by applicable law, we are not liable for indirect or consequential losses. Our total liability is limited to the amount you paid for the service in the preceding month. These limits do not exclude any liability or rights that applicable law does not permit to be excluded.',
    ],
  },
  {
    id: 'termination',
    title: 'Suspension, termination and changes',
    paragraphs: [
      'You may stop using the service at any time. We may restrict, suspend or terminate access for a breach of these terms, non-payment, unlawful use or a risk to the service or other users. We will give reasonable notice where practical.',
      'Contact support to discuss account closure or a data request. We may update these terms as the service evolves and will provide notice where required. The effective date identifies the current version.',
    ],
  },
];
