import type { AccountStage } from './accountApi';

export const isPublicMarketingPage = (name: string) =>
  ['landing', 'pricing', 'checkout', 'request-access'].includes(name);

/** Signed-in customers resume the workspace; pending verification and recovery still work. */
export function signedInRedirect(name: string, stage: AccountStage | null, authMode?: string) {
  if (name === 'contact-support' || name === 'support-guest-ticket') return '/support';
  const completedConfirmation = name === 'auth-confirm' && authMode !== 'recovery' && stage !== null && !['verify_email', 'not_provisioned'].includes(stage);
  if (isPublicMarketingPage(name) || (name === 'auth' && authMode !== 'reset') || completedConfirmation) {
    return stage === 'onboarding' ? '/agents/new' : '/dashboard';
  }
  return null;
}
