import React, { useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';
import { Card } from '../ui/layout';
import { supabase } from '../../lib/supabaseClient';

interface AuthConfirmViewProps {
  navigate: (path: string, replace?: boolean) => void;
}

const LINK_TYPES: EmailOtpType[] = ['invite', 'magiclink', 'recovery'];

const COPY: Record<string, { title: string; description: string; action: string }> = {
  invite: { title: 'Activate your workspace', description: 'Confirm your email address to continue. Next you will choose your password.', action: 'Activate my workspace' },
  magiclink: { title: 'Confirm your email', description: 'Confirm your email address to continue to your workspace.', action: 'Confirm email' },
  recovery: { title: 'Reset your password', description: 'Continue to choose a new password for your workspace.', action: 'Continue' },
};

/**
 * Landing page for links we email (activation, verification, password reset). The token is only
 * used when the person clicks the button, so mail scanners that open links cannot use it up.
 */
export const AuthConfirmView: React.FC<AuthConfirmViewProps> = ({ navigate }) => {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash') ?? '';
  const type = params.get('type') as EmailOtpType | null;
  const valid = Boolean(tokenHash) && type !== null && LINK_TYPES.includes(type);
  const copy = COPY[type ?? ''] ?? COPY.magiclink;

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(!valid);

  const confirm = async () => {
    if (!valid || !type) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    setBusy(false);
    if (error) {
      setFailed(true);
      return;
    }
    // The app routes signed-in users to their current step (set password, onboarding, ...).
    navigate(type === 'recovery' ? '/auth?mode=reset' : '/dashboard', true);
  };

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] flex-1 items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-md">
        <Card variant="floating" padding="lg" className="rounded-large text-center">
          <BrandLogo className="mb-6 justify-center" />
          {failed ? (
            <>
              <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">This link has expired</h1>
              <p className="mb-6 text-sm text-text-subtle">
                Links work once and only for a limited time. Request a fresh one below.
              </p>
              <div className="flex flex-col gap-3">
                {type === 'recovery' ? (
                  <Button onClick={() => navigate('/auth?mode=forgot')}>Send a new reset link</Button>
                ) : (
                  <Button onClick={() => navigate('/auth?mode=resend')}>Send a new activation link</Button>
                )}
                <Button variant="secondary" onClick={() => navigate('/auth')}>Go to sign in</Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">{copy.title}</h1>
              <p className="mb-6 text-sm text-text-subtle">{copy.description}</p>
              <Button size="lg" className="w-full" disabled={busy} onClick={confirm}>
                {busy ? 'Checking link…' : copy.action}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};
