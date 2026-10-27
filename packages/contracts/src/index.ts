// Browser-safe contracts shared by apps/web, apps/api and apps/admin.
// Must not import Node built-ins, @supabase/*, express, or read process.env.
export * from './support';
export {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_LANGUAGES,
  ACCESS_REQUEST_LIMITS,
  ACCESS_REQUEST_VOLUMES,
  LIMITS,
  NOTIFICATION_EVENTS,
  checkAdminPassword,
  checkCustomerPassword,
  parseCouponInput,
  parseFeatureList,
  parsePlanInput,
  validateAccessRequest,
  validateAdminNotes,
  validateCheckoutContact,
  validateContactInput,
  validateNotificationRecipient,
  validateRejectionReason,
  type AccessRequestErrors,
  type AccessRequestInput,
  type AccessRequestValues,
  type AccessRequestVolume,
  type CheckoutContactErrors,
  type CheckoutContactInput,
  type ContactField,
  type CouponColumns,
  type FeatureColumns,
  type FieldErrors,
  type LimitName,
  type NotificationEvent,
  type NotificationRecipientColumns,
  type PlanColumns,
  type Validated,
} from './validation';
export { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_LIST, type SupportedLanguage } from './languages';
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
