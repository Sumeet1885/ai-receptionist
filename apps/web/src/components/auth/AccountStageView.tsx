import React, { useState } from 'react';
import { checkCustomerPassword, LIMITS } from '@ai-receptionist/contracts';
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/field';
import { Card } from '../ui/layout';
import { accountApi, type AccountStage } from '../../lib/accountApi';

interface AccountStageViewProps {
  stage: Exclude<AccountStage, 'onboarding' | 'active'> | 'error';
  email?: string;
  onStageChange: (stage: AccountStage) => void;
  onRetry: () => void;
  signOut: () => void;
}

function Shell({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[calc(100vh-80px)] flex-1 items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-md">
        <Card variant="floating" padding="lg" className="rounded-large">
          <div className="mb-6 text-center">
            <BrandLogo className="mx-auto mb-6 block" />
            <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">{title}</h1>
            <p className="text-sm text-text-subtle">{description}</p>
          </div>
          {children}
        </Card>
      </div>
    </div>
  );
}

// Shown instead of the workspace until the signed-in user has finished activation.
export const AccountStageView: React.FC<AccountStageViewProps> = ({ stage, email, onStageChange, onRetry, signOut }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const signOutLink = (
    <p className="mt-6 text-center text-sm text-text-subtle">
      Not you? <button type="button" className="font-medium text-primary hover:underline" onClick={signOut}>Sign out</button>
    </p>
  );

  if (stage === 'set_password') {
    const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      const problem = checkCustomerPassword(password, email);
      if (problem) return setError(problem);
      if (password !== confirm) return setError('The passwords do not match.');
      setBusy(true);
      setError('');
      try {
        onStageChange((await accountApi.setPassword(password)).stage);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    };
    return (
      <Shell title="Choose your password" description={<>Your email is confirmed{email ? <> as <span className="font-semibold text-text">{email}</span></> : null}. Choose a password to finish activating your workspace.</>}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="stage-password">Password</Label>
            <Input id="stage-password" type="password" autoComplete="new-password" required minLength={LIMITS.customerPassword.min} maxLength={LIMITS.customerPassword.max} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`At least ${LIMITS.customerPassword.min} characters`} />
          </div>
          <div>
            <Label htmlFor="stage-confirm">Confirm password</Label>
            <Input id="stage-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password and continue'}</Button>
        </form>
        {signOutLink}
      </Shell>
    );
  }

  if (stage === 'verify_email') {
    const send = async () => {
      setBusy(true);
      setError('');
      try {
        const result = await accountApi.sendVerificationEmail();
        if (result.stage !== 'verify_email') onStageChange(result.stage);
        else setSent(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    };
    return (
      <Shell title="Confirm your email" description={<>Before you can use your workspace, confirm that <span className="font-semibold text-text">{email ?? 'your email address'}</span> is yours.</>}>
        {sent && <p role="status" className="mb-4 rounded-small border border-success/30 bg-success-surface px-4 py-3 text-sm text-text">Check your inbox for the confirmation link. It may take a minute to arrive.</p>}
        {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" disabled={busy} onClick={send}>{busy ? 'Sending…' : sent ? 'Send it again' : 'Send confirmation email'}</Button>
        {signOutLink}
      </Shell>
    );
  }

  if (stage === 'error') {
    return (
      <Shell title="We could not load your workspace" description="Please check your connection and try again.">
        <Button size="lg" className="w-full" onClick={onRetry}>Try again</Button>
        {signOutLink}
      </Shell>
    );
  }

  return (
    <Shell
      title={stage === 'suspended' ? 'Your workspace is paused' : 'Your workspace is not set up yet'}
      description={stage === 'suspended'
        ? 'Access to this workspace has been paused. Please contact our team for help.'
        : 'Workspaces are created after our team approves an access request. If you already requested access, watch your inbox for the activation email.'}
    >
      <Button size="lg" className="w-full" onClick={signOut}>Sign out</Button>
    </Shell>
  );
};
