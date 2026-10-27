// Browser-safe contracts shared by apps/web, apps/api and apps/admin.
// Must not import Node built-ins, @supabase/*, express, or read process.env.
export { validateContactInput, type ContactField } from './contact-validation';
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
