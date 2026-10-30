// Transactional email content. Every template returns a subject plus matching HTML and text
// bodies; all interpolated values are escaped for HTML. One layout (render) gives every email the
// same look: logo header, label, title, body, optional details / amount / note, one button.
import { config } from '../../config';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'Bolega India';

export function supportNotice(input: { number: string; url: string; created: boolean; sales?: boolean }): EmailContent {
  return {
    subject: `${input.sales ? input.created ? 'Sales enquiry received' : 'Sales enquiry updated' : input.created ? 'Support request received' : 'Support request updated'}: ${input.number}`,
    ...render({
      preview: input.sales ? 'Our sales team has received your pricing enquiry.' : input.created ? 'Your support request has been received.' : 'There is an update to your support request.',
      label: input.sales ? 'Pricing & sales' : 'Customer support', heading: input.sales ? input.created ? 'We received your sales enquiry' : 'Your sales enquiry has an update' : input.created ? 'We received your request' : 'Your support request has an update',
      paragraphs: [input.sales && input.created ? 'Our sales team will review your requirements and get in touch. You can follow the conversation and reply from your enquiry.' : input.created ? 'Our team will review your request. You can follow the conversation and reply from your support ticket.' : input.url ? 'Open your ticket to read the update and reply to our support team.' : 'Use the private ticket link in your original confirmation email to read the update and reply.'],
      details: [['Ticket', input.number]],
      action: input.url ? { label: 'View support ticket', url: input.url } : undefined,
      footnote: input.created ? 'Keep your ticket link private. Guest links expire after 180 days.' : undefined,
      reason: 'You received this email because a support request was submitted using this address.',
    }),
  };
}

export function supportAdminAlert(input: { number: string; subject: string; category: string; url: string; sales?: boolean }): EmailContent {
  return { subject: `${input.sales ? 'New pricing & sales enquiry' : 'New support ticket'}: ${input.number}`, ...render({
    preview: input.sales ? 'A customer would like to discuss pricing or a custom plan.' : 'A new support ticket needs review.', label: input.sales ? 'Sales enquiry' : 'Support alert', heading: input.sales ? 'New pricing & sales enquiry' : 'New support request',
    paragraphs: ['Open the admin console to review and respond.'], details: [['Ticket', input.number], ['Subject', input.subject], ['Category', input.category]],
    action: { label: 'Review ticket', url: input.url }, internal: true,
  }) };
}
// Browser previews use the web asset. The sender embeds this marked image using a CID attachment.
const LOGO_URL = () => `${config.email.assetBaseUrl}/bolegaindia/brand/bolegaindia-logo.png`;

const COLOR = {
  page: '#f4f2ea',
  card: '#ffffff',
  border: '#e3e6dc',
  ink: '#12332b',
  body: '#3b4a44',
  muted: '#6b7a73',
  brand: '#0f4d3c',
  soft: '#f7f8f4',
};

const TONES = {
  brand: { label: '#24695b', bg: '#eef5f1', bar: '#24695b', text: '#1d4f43' },
  success: { label: '#15803d', bg: '#f0fdf4', bar: '#22c55e', text: '#166534' },
  warning: { label: '#b45309', bg: '#fffbeb', bar: '#f59e0b', text: '#92400e' },
  danger: { label: '#b91c1c', bg: '#fef2f2', bar: '#ef4444', text: '#991b1b' },
} as const;
type Tone = keyof typeof TONES;

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Layout {
  /** Shown by inbox lists next to the subject. */
  preview: string;
  label: string;
  tone?: Tone;
  heading: string;
  /** Name for "Hi …,"; leave out for internal alerts. */
  greeting?: string;
  paragraphs: string[];
  details?: Array<[label: string, value: string]>;
  amount?: { label: string; value: string; note?: string };
  note?: { title?: string; text: string; tone?: Tone };
  action?: { label: string; url: string };
  /** Small print under the button, e.g. link expiry. */
  footnote?: string;
  /** Why the person got this email, in the footer. */
  reason?: string;
  /** Internal alerts skip the "the team" sign-off. */
  internal?: boolean;
}

function render(layout: Layout): { html: string; text: string } {
  const tone = TONES[layout.tone ?? 'brand'];
  const e = escapeHtml;
  const p = (text: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COLOR.body}">${e(text)}</p>`;

  const details = layout.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${COLOR.soft};border:1px solid ${COLOR.border};border-radius:10px">
${layout.details.map(([label, value], i) => `<tr>
<td style="padding:11px 18px;font-size:13px;color:${COLOR.muted};${i ? `border-top:1px solid ${COLOR.border};` : ''}">${e(label)}</td>
<td align="right" style="padding:11px 18px;font-size:14px;font-weight:600;color:${COLOR.ink};word-break:break-word;${i ? `border-top:1px solid ${COLOR.border};` : ''}">${e(value)}</td>
</tr>`).join('')}
</table>`
    : '';

  const amount = layout.amount
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;background:${COLOR.brand};border-radius:12px"><tr><td style="padding:20px 24px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:#cfe8a9">${e(layout.amount.label)}</p>
<p style="margin:0;font-size:28px;font-weight:700;color:#ffffff">${e(layout.amount.value)}</p>
${layout.amount.note ? `<p style="margin:6px 0 0;font-size:13px;color:#d5e4dc">${e(layout.amount.note)}</p>` : ''}
</td></tr></table>`
    : '';

  const noteTone = TONES[layout.note?.tone ?? 'brand'];
  const note = layout.note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px"><tr><td style="background:${noteTone.bg};border-left:4px solid ${noteTone.bar};border-radius:0 8px 8px 0;padding:14px 18px">
${layout.note.title ? `<p style="margin:0 0 4px;font-size:14px;font-weight:700;color:${noteTone.text}">${e(layout.note.title)}</p>` : ''}
<p style="margin:0;font-size:13px;line-height:20px;color:${noteTone.text}">${e(layout.note.text)}</p>
</td></tr></table>`
    : '';

  const action = layout.action
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td align="center">
<a href="${e(layout.action.url)}" style="display:inline-block;background:${COLOR.brand};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 30px;border-radius:999px">${e(layout.action.label)}</a>
</td></tr></table>
<p style="margin:14px 0 4px;font-size:12px;color:${COLOR.muted};text-align:center">Button not working? Copy this link into your browser:</p>
<p style="margin:0 0 8px;font-size:12px;text-align:center;word-break:break-all"><a href="${e(layout.action.url)}" style="color:#24695b">${e(layout.action.url)}</a></p>`
    : '';

  const footnote = layout.footnote ? `<p style="margin:22px 0 0;font-size:13px;line-height:20px;color:${COLOR.muted}">${e(layout.footnote)}</p>` : '';
  const signoff = layout.internal ? '' : `<p style="margin:26px 0 0;font-size:15px;line-height:24px;color:${COLOR.body}">Warm regards,<br><strong style="color:${COLOR.ink}">The ${BRAND} team</strong></p>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${e(layout.heading)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.page};font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(layout.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:16px;overflow:hidden">
<tr><td align="center" style="padding:24px 36px;border-top:4px solid ${COLOR.brand};border-bottom:1px solid ${COLOR.border}">
<img src="${e(LOGO_URL())}" data-email-logo="brand" alt="${BRAND}" width="170" height="37" style="display:block;border:0;height:37px;width:170px;font-size:18px;font-weight:700;color:${COLOR.brand}">
</td></tr>
<tr><td style="padding:32px 36px 34px">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${tone.label}">${e(layout.label)}</p>
<h1 style="margin:0 0 20px;font-size:23px;line-height:30px;font-weight:700;color:${COLOR.ink}">${e(layout.heading)}</h1>
${layout.greeting ? p(`Hi ${layout.greeting},`) : ''}
${layout.paragraphs.map(p).join('')}
${details}${amount}${note}${action}${footnote}${signoff}
</td></tr></table>
<p style="margin:18px 0 0;font-size:12px;line-height:18px;color:${COLOR.muted};text-align:center">${BRAND} · AI receptionist for Indian businesses</p>
${layout.reason ? `<p style="margin:4px 0 0;font-size:12px;line-height:18px;color:${COLOR.muted};text-align:center">${e(layout.reason)}</p>` : ''}
</td></tr></table></body></html>`;

  const text = [
    layout.heading,
    '',
    ...(layout.greeting ? [`Hi ${layout.greeting},`, ''] : []),
    ...layout.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(layout.details?.length ? [...layout.details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(layout.amount ? [`${layout.amount.label}: ${layout.amount.value}${layout.amount.note ? ` (${layout.amount.note})` : ''}`, ''] : []),
    ...(layout.note ? [`${layout.note.title ? `${layout.note.title}: ` : ''}${layout.note.text}`, ''] : []),
    ...(layout.action ? [`${layout.action.label}: ${layout.action.url}`, ''] : []),
    ...(layout.footnote ? [layout.footnote, ''] : []),
    ...(layout.internal ? [] : ['Warm regards,', `The ${BRAND} team`, '']),
    `— ${BRAND} · AI receptionist for Indian businesses`,
    ...(layout.reason ? [layout.reason] : []),
  ].join('\n');

  return { html, text };
}

const linkExpiry = (hours: number) => `This link works once and expires in ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;

// ── free access ──────────────────────────────────────────────────────────────

export function accessRequestReceived(input: { name: string }): EmailContent {
  return {
    subject: `We received your ${BRAND} access request`,
    ...render({
      preview: 'Our team reviews every request personally, usually within one working day.',
      label: 'Request received',
      heading: 'Thank you for your interest',
      greeting: input.name,
      paragraphs: [
        'We have received your request for free access to Bolega India. Our team reviews every request personally, usually within one working day.',
        'When your workspace is ready you will get an email with a link to activate it. Nothing else is needed from you right now.',
      ],
      reason: 'You received this email because this address was used on our free-access form. If that was not you, you can ignore it.',
    }),
  };
}

// Sent when someone submits the form again, so the address owner learns the status without the
// public form revealing whether a request or account exists.
export function accessRequestStatus(input: { name: string; status: 'open' | 'approved' | 'account_exists'; signInUrl: string }): EmailContent {
  const byStatus = {
    open: {
      heading: 'Your request is still being reviewed',
      paragraphs: ['We already have your access request and our team is reviewing it. You do not need to submit it again; we will email you as soon as your workspace is ready.'],
      action: undefined,
    },
    approved: {
      heading: 'Your request was already approved',
      paragraphs: ['Your workspace has been set up. Use the activation email we sent earlier, or request a new activation link from the sign-in page.'],
      action: { label: 'Go to sign in', url: input.signInUrl },
    },
    account_exists: {
      heading: 'You already have an account',
      paragraphs: ['This email address already has a workspace. Sign in, or reset your password if you have forgotten it.'],
      action: { label: 'Go to sign in', url: input.signInUrl },
    },
  }[input.status];

  return {
    subject: `About your ${BRAND} access request`,
    ...render({
      preview: byStatus.heading,
      label: 'Request update',
      heading: byStatus.heading,
      greeting: input.name,
      paragraphs: byStatus.paragraphs,
      action: byStatus.action,
      reason: 'If you did not submit a request, you can ignore this email.',
    }),
  };
}

export function accessRequestDeclined(input: { name: string; reason?: string }): EmailContent {
  return {
    subject: `About your ${BRAND} access request`,
    ...render({
      preview: 'An update on your free-access request.',
      label: 'Request update',
      tone: 'danger',
      heading: 'We cannot offer free access right now',
      greeting: input.name,
      paragraphs: [
        'Thank you for your interest in Bolega India. After reviewing your request, we are not able to offer free access at the moment.',
        'You can still choose a paid plan on our pricing page, and you are welcome to reply to this email if you have questions.',
      ],
      note: input.reason ? { title: 'Note from our team', text: input.reason, tone: 'warning' } : undefined,
    }),
  };
}

/** Sent when an admin approves a request: the workspace exists, the person activates it. */
export function workspaceActivation(input: { name: string; activationUrl: string; expiresInHours: number }): EmailContent {
  return {
    subject: `Your ${BRAND} workspace is ready`,
    ...render({
      preview: 'Activate your workspace to confirm your email and choose a password.',
      label: 'Workspace ready',
      tone: 'success',
      heading: 'Your workspace is ready',
      greeting: input.name,
      paragraphs: [
        'Good news: your free-access request has been approved and your Bolega India workspace is ready.',
        'Activate it to confirm this email address and choose your password. Then we will guide you through setting up your AI receptionist.',
      ],
      action: { label: 'Activate my workspace', url: input.activationUrl },
      footnote: `${linkExpiry(input.expiresInHours)} If it has expired, request a new one from the sign-in page.`,
    }),
  };
}

// ── account ──────────────────────────────────────────────────────────────────

export function emailVerification(input: {
  verificationUrl: string;
  expiresInHours: number;
  // Paid signups: what was bought, shown above the confirmation request.
  purchase?: { name: string; planName: string; amount: string };
}): EmailContent {
  const { purchase } = input;
  return {
    subject: purchase ? `Payment received: confirm your email for ${BRAND}` : `Confirm your email for ${BRAND}`,
    ...render({
      preview: purchase ? `Thank you for your payment of ${purchase.amount}. One step left: confirm your email.` : 'Confirm your email address to continue.',
      label: purchase ? 'Payment received' : 'Email verification',
      tone: purchase ? 'success' : 'brand',
      heading: purchase ? 'One step left: confirm your email' : 'Confirm your email address',
      greeting: purchase?.name,
      paragraphs: purchase
        ? ['Thank you for choosing Bolega India. Your payment was successful and your workspace has been created.', 'Confirm this email address to open it. Then we will guide you through setting up your AI receptionist.']
        : ['Please confirm this email address to continue to your workspace.'],
      details: purchase ? [['Plan', purchase.planName], ['Amount paid', purchase.amount]] : undefined,
      action: { label: 'Confirm my email', url: input.verificationUrl },
      footnote: `${linkExpiry(input.expiresInHours)} If it has expired, request a new one from the sign-in page.`,
      reason: purchase ? 'You received this email because this address was used to buy a Bolega India plan.' : 'If you did not create an account, you can ignore this email.',
    }),
  };
}

export function passwordReset(input: { resetUrl: string; expiresInHours: number }): EmailContent {
  return {
    subject: `Reset your ${BRAND} password`,
    ...render({
      preview: 'Choose a new password for your workspace.',
      label: 'Password reset',
      heading: 'Reset your password',
      paragraphs: ['We received a request to reset the password for your Bolega India workspace. Choose a new password with the button below.'],
      action: { label: 'Choose a new password', url: input.resetUrl },
      note: { text: 'If you did not ask for a reset, you can ignore this email; your password stays the same.', tone: 'warning' },
      footnote: linkExpiry(input.expiresInHours),
    }),
  };
}

/** Security notice after a password is changed or reset. */
export function passwordChanged(input: { email: string; when: string; resetUrl: string }): EmailContent {
  return {
    subject: `Your ${BRAND} password was changed`,
    ...render({
      preview: 'If this was you, there is nothing more to do.',
      label: 'Security notice',
      tone: 'warning',
      heading: 'Your password was changed',
      paragraphs: ['The password for your Bolega India workspace was just changed. If this was you, there is nothing more to do.'],
      details: [['Account', input.email], ['Changed', input.when]],
      note: { title: 'Not you?', text: 'Reset your password straight away and reply to this email so we can secure your workspace.', tone: 'danger' },
      action: { label: 'Reset my password', url: input.resetUrl },
    }),
  };
}

/** After first-time setup is finished. */
export function onboardingComplete(input: { name: string; dashboardUrl: string }): EmailContent {
  return {
    subject: `You're all set on ${BRAND}`,
    ...render({
      preview: 'Your workspace is set up. Here is what to do next.',
      label: 'Welcome aboard',
      tone: 'success',
      heading: 'Your workspace is set up',
      greeting: input.name,
      paragraphs: [
        'Welcome to Bolega India! Your AI receptionist is ready to start answering your customers.',
        'A few things worth doing next: add your business details and FAQs to its knowledge, install the chat widget on your website, and try a test call in your preferred language.',
      ],
      action: { label: 'Open my dashboard', url: input.dashboardUrl },
      footnote: 'Need a hand? Reply to this email and our team will help you get set up.',
    }),
  };
}

// ── billing ──────────────────────────────────────────────────────────────────

/** Status-specific follow-up for an unpaid checkout, used by automatic and admin sends. */
export function paymentReminder(input: {
  name: string; businessName: string; planName: string; amount: string;
  resumeUrl: string; pricingUrl: string; stage?: 'started' | 'closed' | 'failed';
  canResume?: boolean; existingWorkspace?: boolean;
}): EmailContent {
  const stage = input.stage || 'started';
  const copy = {
    started: { subject: `Complete your ${BRAND} purchase`, label: 'Checkout started', heading: 'Ready when you are',
      text: `You started checkout for ${input.planName} for ${input.businessName}, but payment has not been completed. Continue when you are ready to get started with your AI receptionist.` },
    closed: { subject: `Your ${BRAND} checkout is waiting`, label: 'Checkout not completed', heading: 'Pick up where you left off',
      text: `Your checkout for ${input.planName} was closed before payment was completed. If you would like to continue with ${input.businessName}, you can return when it suits you.` },
    failed: { subject: `Need help completing your ${BRAND} payment?`, label: 'Payment needs attention', heading: 'Let us help you finish your payment',
      text: `We could not confirm a successful payment for ${input.planName} for ${input.businessName}. You can return to checkout to try again, or reply to this email if you need help.` },
  }[stage];
  const canResume = input.canResume !== false;
  return {
    subject: copy.subject,
    ...render({
      preview: copy.text, label: copy.label, heading: copy.heading,
      tone: stage === 'failed' ? 'warning' : 'brand', greeting: input.name,
      paragraphs: [copy.text, input.existingWorkspace
        ? 'Sign in to your existing workspace to choose a plan and restore access after payment is confirmed.'
        : canResume ? 'Your saved checkout keeps the plan and quoted amount shown below.'
          : 'Use the button below to return to checkout with your contact details prefilled. Review the available plan and finish any required details before payment.'],
      details: [['Plan', input.planName], ['Business', input.businessName]],
      amount: { label: canResume ? 'Total due today' : 'Previous checkout total', value: input.amount, note: 'First month plus setup, including any checkout discount' },
      action: { label: input.existingWorkspace ? 'Open my workspace' : canResume ? stage === 'failed' ? 'Retry my payment' : 'Continue my checkout' : 'Continue to checkout', url: input.resumeUrl },
      note: { text: stage === 'failed' ? 'If your bank shows a debit, check the payment status or contact us before trying again. We are happy to help.' : 'Have a question about your plan or payment? Reply to this email and our team will help.' },
      footnote: canResume && !input.existingWorkspace ? 'This private checkout link is valid for 7 days. If you have already paid, please ignore this email.' : 'If you have already completed payment, please ignore this email.',
      reason: 'You received this follow-up because this email address was used to start a Bolega India checkout.',
    }),
  };
}

// ── internal alerts (admin console) ──────────────────────────────────────────

export function adminNewAccessRequest(input: {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  industry: string;
  consoleUrl: string;
}): EmailContent {
  return {
    subject: `New access request: ${input.businessName}`,
    ...render({
      preview: `${input.name} from ${input.businessName} requested free access.`,
      label: 'Admin alert',
      heading: 'New free-access request',
      paragraphs: [`${input.name} from ${input.businessName} has requested free access.`],
      details: [['Business', input.businessName], ['Industry', input.industry], ['Name', input.name], ['Email', input.email], ['Phone', input.phone]],
      action: { label: 'Review in the admin console', url: input.consoleUrl },
      internal: true,
      reason: 'You get this alert because your address is on the Notifications list in the admin console.',
    }),
  };
}

export function adminNewPayment(input: { name: string; email: string; businessName: string; planName: string; amount: string; consoleUrl: string }): EmailContent {
  return {
    subject: `New payment: ${input.businessName} (${input.planName})`,
    ...render({
      preview: `${input.businessName} paid ${input.amount} for ${input.planName}.`,
      label: 'Admin alert',
      tone: 'success',
      heading: 'New paid signup',
      paragraphs: [`${input.name} from ${input.businessName} bought ${input.planName}. Their workspace was created and the email confirmation sent.`],
      amount: { label: 'Amount paid', value: input.amount, note: input.planName },
      details: [['Business', input.businessName], ['Name', input.name], ['Email', input.email]],
      action: { label: 'View revenue', url: input.consoleUrl },
      internal: true,
      reason: 'You get this alert because your address is on the Notifications list in the admin console.',
    }),
  };
}

export function adminSignupLead(input: {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  planName: string;
  amount: string;
  outcome: 'closed' | 'failed';
  reason?: string;
  consoleUrl: string;
}): EmailContent {
  const what = input.outcome === 'closed' ? 'closed the checkout without paying' : 'tried to pay, but the payment failed';
  return {
    subject: `Signup lead: ${input.businessName} (${input.planName})`,
    ...render({
      preview: `${input.businessName} ${what}. Follow up while it is fresh.`,
      label: 'Customer follow-up',
      tone: 'warning',
      heading: input.outcome === 'closed' ? 'Checkout closed before payment' : 'Payment attempt failed',
      paragraphs: [`${input.name} from ${input.businessName} chose ${input.planName} and ${what}. They get an automatic reminder in a few minutes; a personal call often helps more.`],
      details: [['Business', input.businessName], ['Name', input.name], ['Email', input.email], ['Phone', input.phone], ['Plan', input.planName], ['Amount', input.amount]],
      note: input.reason ? { title: 'Reason from Razorpay', text: input.reason, tone: 'danger' } : undefined,
      action: { label: 'View signup leads', url: input.consoleUrl },
      internal: true,
      reason: 'You get this alert because your address is on the Notifications list in the admin console.',
    }),
  };
}

export function customerPaymentReceipt(input: {
  name: string;
  businessName: string;
  planName: string;
  amount: string;
  kind?: string;
  minutesAdded?: number | null;
  dashboardUrl: string;
}): EmailContent {
  const isTopup = input.kind === 'topup';
  const title = isTopup ? 'Calling minutes top-up confirmed' : 'Payment successful & plan active';
  return {
    subject: `Payment receipt: ${input.planName} (${input.amount})`,
    ...render({
      preview: `Thank you for your payment of ${input.amount}. Your receipt from ${BRAND}.`,
      label: 'Payment receipt',
      tone: 'success',
      heading: title,
      paragraphs: [
        `Thank you for your payment, ${input.name}. Your transaction was successful.`,
        isTopup
          ? `${input.minutesAdded || 'Extra'} calling minutes have been added to your ${input.businessName} workspace balance.`
          : `Your subscription to ${input.planName} is active for your workspace.`,
      ],
      amount: { label: 'Amount paid', value: input.amount, note: input.planName },
      details: [
        ['Business', input.businessName],
        ['Plan / Item', input.planName],
        ['Amount', input.amount],
        ...(input.minutesAdded ? [['Minutes added', `${input.minutesAdded} minutes`]] : []),
      ],
      action: { label: 'Open my dashboard', url: input.dashboardUrl },
      reason: 'You received this receipt because a payment was completed for your workspace.',
    }),
  };
}

export function planUpdateNotice(input: {
  name: string;
  planName: string;
  monthlyMinutes?: number | null;
  periodEnd?: string | null;
  dashboardUrl: string;
}): EmailContent {
  return {
    subject: `Your plan has been updated: ${input.planName}`,
    ...render({
      preview: `An administrator has updated your workspace plan to ${input.planName}.`,
      label: 'Plan update',
      tone: 'success',
      heading: 'Your plan has been updated',
      paragraphs: [
        `Hello ${input.name}, an administrator has updated your workspace plan to ${input.planName}. Your new minutes quota and features are now active on your dashboard.`,
      ],
      details: [
        ['New plan', input.planName],
        ...(input.monthlyMinutes ? [['Monthly minutes', `${input.monthlyMinutes} minutes`]] : []),
        ...(input.periodEnd ? [['Access valid until', input.periodEnd]] : []),
      ],
      action: { label: 'Open My Workspace', url: input.dashboardUrl },
      reason: 'You received this notification because an administrator updated your plan on Bolega India.',
    }),
  };
}

export function adminTestAlert(input: { consoleUrl: string }): EmailContent {
  return {
    subject: `Test alert from ${BRAND}`,
    ...render({
      preview: 'Alert emails are reaching this address.',
      label: 'Admin alert',
      tone: 'success',
      heading: 'Alerts are working',
      paragraphs: ['This is a test from the admin console. This address will receive the alerts selected for it in Notifications.'],
      action: { label: 'Open notification settings', url: input.consoleUrl },
      internal: true,
    }),
  };
}
