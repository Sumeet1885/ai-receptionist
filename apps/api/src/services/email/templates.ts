// Transactional email content. Every template returns a subject plus matching HTML and text
// bodies; all interpolated values are escaped for HTML.

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = 'Bolega India';

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Layout {
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
}

function render({ heading, paragraphs, action, footnote }: Layout): { html: string; text: string } {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#173e36;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#5f6a5e;line-height:1.5">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : '';
  const note = footnote ? `<p style="margin:24px 0 0;font-size:13px;color:#5f6a5e;line-height:1.5">${escapeHtml(footnote)}</p>` : '';

  const html = `<!doctype html><html><body style="margin:0;background:#f7f6ef;font-family:Arial,Helvetica,sans-serif;color:#173e36">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6ef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #dce1d2;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-weight:700;color:#24695b">${BRAND}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(heading)}</h1>
${body}${button}${note}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#5f6a5e">${BRAND} · AI receptionist for Indian businesses</p>
</td></tr></table></body></html>`;

  const text = [
    heading,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
    ...(footnote ? [footnote, ''] : []),
    `— ${BRAND}`,
  ].join('\n');

  return { html, text };
}

export function accessRequestReceived(input: { name: string }): EmailContent {
  return {
    subject: `We received your ${BRAND} access request`,
    ...render({
      heading: `Thanks, ${input.name}`,
      paragraphs: [
        'We have received your request for free access. Our team reviews every request personally, usually within one working day.',
        'When your workspace is ready you will get an email with a link to activate it. Nothing else is needed from you right now.',
      ],
      footnote: 'If you did not request access, you can ignore this email.',
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
      heading: byStatus.heading,
      paragraphs: [`Hi ${input.name},`, ...byStatus.paragraphs],
      action: byStatus.action,
      footnote: 'If you did not submit a request, you can ignore this email.',
    }),
  };
}

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
      heading: 'New free-access request',
      paragraphs: [
        `${input.name} from ${input.businessName} (${input.industry}) has requested access.`,
        `Email: ${input.email} · Phone: ${input.phone}`,
      ],
      action: { label: 'Review in the admin console', url: input.consoleUrl },
    }),
  };
}

export function workspaceActivation(input: { name: string; activationUrl: string; expiresInHours: number }): EmailContent {
  return {
    subject: `Your ${BRAND} workspace is ready`,
    ...render({
      heading: `Welcome to ${BRAND}, ${input.name}`,
      paragraphs: [
        'Your free-access request has been approved and your workspace is ready.',
        'Activate it to confirm this email address and choose your password. Then we will help you set up your AI receptionist.',
      ],
      action: { label: 'Activate my workspace', url: input.activationUrl },
      footnote: `This link works once and expires in ${input.expiresInHours} hours. If it has expired, request a new one from the sign-in page.`,
    }),
  };
}

export function emailVerification(input: { verificationUrl: string; expiresInHours: number }): EmailContent {
  return {
    subject: `Confirm your email for ${BRAND}`,
    ...render({
      heading: 'Confirm your email address',
      paragraphs: ['Confirm this email address to continue to your workspace.'],
      action: { label: 'Confirm email', url: input.verificationUrl },
      footnote: `This link works once and expires in ${input.expiresInHours} hours. If you did not ask for it, you can ignore this email.`,
    }),
  };
}

export function passwordReset(input: { resetUrl: string; expiresInHours: number }): EmailContent {
  return {
    subject: `Reset your ${BRAND} password`,
    ...render({
      heading: 'Reset your password',
      paragraphs: ['We received a request to reset the password for your workspace. Choose a new password with the button below.'],
      action: { label: 'Choose a new password', url: input.resetUrl },
      footnote: `This link works once and expires in ${input.expiresInHours} hours. If you did not ask for a reset, ignore this email; your password stays the same.`,
    }),
  };
}

export function accessRequestDeclined(input: { name: string; reason?: string }): EmailContent {
  return {
    subject: `About your ${BRAND} access request`,
    ...render({
      heading: `Hi ${input.name}`,
      paragraphs: [
        'Thank you for your interest. We are not able to offer free access for this request at the moment.',
        ...(input.reason ? [input.reason] : []),
        'You are welcome to reply to this email if you have questions.',
      ],
    }),
  };
}
