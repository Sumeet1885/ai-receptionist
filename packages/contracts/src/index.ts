// Browser-safe contracts shared by apps/web, apps/api and apps/admin.
// Must not import Node built-ins, @supabase/*, express, or read process.env.
export { validateContactInput, type ContactField } from './contact-validation';
export {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_LANGUAGES,
  ACCESS_REQUEST_LIMITS,
  ACCESS_REQUEST_VOLUMES,
  validateAccessRequest,
  type AccessRequestErrors,
  type AccessRequestInput,
  type AccessRequestValues,
  type AccessRequestVolume,
} from './access-request';
export { FORM_ELAPSED_FIELD, HONEYPOT_FIELD, MIN_FORM_FILL_MS, TURNSTILE_TOKEN_FIELD } from './public-forms';
export {
  defaultWidgetConfig,
  type LeadField,
  type WidgetConfig,
  type WidgetLauncherPosition,
  type WidgetLauncherStyle,
  type WidgetRadius,
  type WidgetSize,
  type WidgetTheme,
} from './widget-config';
