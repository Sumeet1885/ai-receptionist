import { readFileSync } from 'node:fs';
import type { Attachment } from '@aws-sdk/client-sesv2';

const CONTENT_ID = 'bolega-india-logo';
const LOGO_MARKER = /<img src="[^"]*" data-email-logo="brand"/g;
let logo: Buffer | undefined;

/** Embed only our template logo; links and user-controlled content are never rewritten. */
export function withInlineLogo(html: string): { html: string; attachments: Attachment[] } {
  if (!html.includes('data-email-logo="brand"')) return { html, attachments: [] };
  logo ??= readFileSync(new URL('../../../assets/email-logo.png', import.meta.url));
  return {
    html: html.replace(LOGO_MARKER, `<img src="cid:${CONTENT_ID}"`),
    attachments: [{
      RawContent: logo,
      FileName: 'bolega-india-logo.png',
      ContentType: 'image/png',
      ContentDisposition: 'INLINE',
      ContentId: CONTENT_ID,
      ContentTransferEncoding: 'BASE64',
    }],
  };
}
