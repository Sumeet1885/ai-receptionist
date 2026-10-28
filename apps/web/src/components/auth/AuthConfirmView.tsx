import React, { useEffect, useRef, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';
import { Card } from '../ui/layout';
import { supabase } from '../../lib/supabaseClient';
import type { AccountStage } from '../../lib/accountApi';

interface AuthConfirmViewProps {
  navigate: (path: string, replace?: boolean) => void;
  user: { email?: string } | null;
  accountStage: AccountStage | null;
  checkingAccount: boolean;
}

const LINK_TYPES: EmailOtpType[] = ['invite', 'magiclink', 'recovery'];

/** Email links start verification automatically and continue to the account's next step. */
export const AuthConfirmView: React.FC<AuthConfirmViewProps> = ({ navigate, user, accountStage, checkingAccount }) => {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash') ?? '';
  const type = params.get('type') as EmailOtpType | null;
  const valid = Boolean(tokenHash) && type !== null && LINK_TYPES.includes(type);


  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const automaticAttempt = useRef('');
  const [failed, setFailed] = useState(!valid);
  const [error, setError] = useState('');
  const [useLink, setUseLink] = useState(false);
  // A used token cannot identify its owner. Only the authenticated account's server state
  // establishes verification; recovery links must always be verified before password reset.
  const alreadyVerified = type !== 'recovery' && !!user && ['set_password', 'onboarding', 'active', 'scheduled', 'payment_required'].includes(accountStage || '');

  const confirm = async () => {
    if (!valid || !type || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const { error: verificationError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (verificationError) {
        if (verificationError.code === 'otp_expired' || [400, 403, 422].includes(verificationError.status || 0)) setFailed(true);
        else setError('We could not check this link right now. Please try again.');
        return;
      }
      // Replace the token URL after success so refreshing cannot consume the link again.
      navigate(type === 'recovery' ? '/auth?mode=reset' : '/dashboard', true);
    } catch {
      setError('We could not check this link right now. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const confirmLatest = useRef(confirm);
  confirmLatest.current = confirm;
  useEffect(() => {
    if (!valid || checkingAccount || (alreadyVerified && !useLink)) return;
    const key = `${type}:${tokenHash}`;
    if (automaticAttempt.current === key) return;
    automaticAttempt.current = key;
    void confirmLatest.current();
  }, [valid, checkingAccount, alreadyVerified, useLink, type, tokenHash]);

  return (
    <div style={publicTexture('arches')} className="relative flex min-h-[calc(100vh-80px)] flex-1 items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-md">
        <Card variant="floating" padding="lg" className="rounded-large text-center">
          <BrandLogo className="mx-auto mb-6 block" />
          {checkingAccount && type !== 'recovery' ? (
            <p role="status" className="text-sm text-text-subtle">Checking your workspace...</p>
          ) : alreadyVerified && !useLink ? (
            <>
              <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">Your email is already confirmed</h1>
              <p className="mb-6 break-words text-sm text-text-subtle">You are signed in{user?.email ? ` as ${user.email}` : ''}. {accountStage === 'set_password' ? 'Choose your password to finish setup.' : 'Continue to your workspace. No new activation link is needed.'}</p>
              <Button size="lg" className="w-full" onClick={() => navigate('/dashboard', true)}>{accountStage === 'set_password' ? 'Choose your password' : 'Continue to workspace'}</Button>
              {valid && <Button variant="link" className="mt-4" onClick={() => setUseLink(true)}>Use this email link for another account</Button>}
            </>
          ) : failed ? (
            <>
              <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">This link is expired or already used</h1>
              <p className="mb-6 text-sm text-text-subtle">
                {type === 'recovery' ? 'Reset links work once and for a limited time. Request a new reset link to continue.' : 'If you already activated your workspace, sign in with your email and password. Only request a new activation link if setup is still incomplete.'}
              </p>
              <div className="flex flex-col gap-3">
                {type === 'recovery' ? (
                  <Button onClick={() => navigate('/auth?mode=forgot')}>Send a new reset link</Button>
                ) : (
                  <Button onClick={() => navigate(alreadyVerified ? '/dashboard' : '/auth?mode=signin', true)}>{alreadyVerified ? 'Continue to current workspace' : 'Go to sign in'}</Button>
                )}
                {type === 'recovery' ? <Button variant="secondary" onClick={() => navigate('/auth?mode=signin')}>Go to sign in</Button> : !alreadyVerified && <Button variant="secondary" onClick={() => navigate('/auth?mode=resend')}>Setup incomplete? Request a new link</Button>}
              </div>
            </>
          ) : (
            <>
              <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">{type === 'recovery' ? 'Checking your reset link' : 'Verifying your email'}</h1>
              {error ? <>
                <p role="alert" className="mb-4 text-sm text-danger">{error}</p>
                <Button size="lg" className="w-full" disabled={busy} onClick={confirm}>Try again</Button>
              </> : <p role="status" className="text-sm text-text-subtle">{type === 'recovery' ? 'Please wait while we open password reset...' : 'Please wait while we verify your email and open your workspace...'}</p>}

            </>
          )}
        </Card>
      </div>
    </div>
  );
};
import { publicTexture } from '../../lib/publicTexture';
