// All validation for what people type, shared by the web app, the admin console and the API.
//
//   limits.ts          every min/max in one place
//   fields.ts          reusable field rules (text, email, phone, numbers, dates, choices)
//   contact.ts         email and phone checks
//   passwords.ts       customer and admin password rules
//   access-request.ts  free-access request form
//   checkout.ts        paid checkout details
//   access-review.ts   admin notes and decline reason
//   billing-admin.ts   plans, comparison rows and coupons
//   notifications.ts   who gets the admin alert emails
export { LIMITS, type LimitName } from './limits';
export { type FieldErrors, type Validated } from './fields';
export { validateContactInput, type ContactField } from './contact';
export { checkAdminPassword, checkCustomerPassword } from './passwords';
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
export { validateCheckoutContact, type CheckoutContactErrors, type CheckoutContactInput } from './checkout';
export { validateAdminNotes, validateRejectionReason } from './access-review';
export {
  parseCouponInput,
  parseFeatureList,
  parsePlanInput,
  type CouponColumns,
  type FeatureColumns,
  type PlanColumns,
} from './billing-admin';
export {
  NOTIFICATION_EVENTS,
  validateNotificationRecipient,
  type NotificationEvent,
  type NotificationRecipientColumns,
} from './notifications';
