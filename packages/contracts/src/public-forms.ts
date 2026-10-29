// Field names shared by public (unauthenticated) forms and the API guards that check them.

// Visually hidden input people never see or fill; form-filling bots fill every field. The name is
// deliberately meaningless so browser and password-manager autofill leave it empty.
export const HONEYPOT_FIELD = 'ref_code_x7';
// Milliseconds between the form rendering and submit, measured on the browser's own clock.
export const FORM_ELAPSED_FIELD = 'formElapsedMs';
// Cloudflare Turnstile response token.
export const TURNSTILE_TOKEN_FIELD = 'turnstileToken';
// Faster than this is not a person filling the form.
export const MIN_FORM_FILL_MS = 3000;
