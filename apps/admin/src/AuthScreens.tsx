import { useState, type FormEvent, type ReactNode } from 'react';
import { checkAdminPassword, LIMITS } from '@ai-receptionist/contracts';
import { AlertCircle, KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { ApiError, adminApi, type AdminSession } from './api';
import { Button, LOGO_WHITE } from './ui';

const INPUT = 'h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-subtle/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-ink px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-lime/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-primary/40 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5 text-white">
          <img src={LOGO_WHITE} alt="Bolega India" className="h-9 w-auto" />
          <span className="rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink">Admin</span>
        </div>
        {children}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-white/60">
          <ShieldCheck className="h-3.5 w-3.5" /> Restricted area. Every sign-in and action is audited.
        </p>
      </div>
    </main>
  );
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-surface px-3 py-2 text-sm text-danger">
      <AlertCircle className="h-4 w-4 shrink-0" /> {message}
    </p>
  );
}

export function LoginScreen({ onSignedIn }: { onSignedIn: (session: AdminSession) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await adminApi.login(email, password));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'Too many attempts. Try again in a few minutes.' : (err as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-7 shadow-2xl">
        <div>
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><LockKeyhole className="h-5 w-5" /></span>
          <h1 className="font-display text-2xl font-bold tracking-tight">Admin sign in</h1>
          <p className="mt-1 text-sm text-subtle">Review access requests and manage workspaces.</p>
        </div>
        <ErrorNote message={error} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input className={INPUT} type="email" autoComplete="username" required autoFocus maxLength={LIMITS.email.max} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Password</span>
          <input className={INPUT} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in'}
        </Button>
        <p className="text-center text-xs text-subtle">Admin accounts are created by a super admin. There is no self-signup.</p>
      </form>
    </Frame>
  );
}

export function ChangePasswordScreen({ onChanged, onSignOut }: { onChanged: (session: AdminSession) => void; onSignOut: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // The server also checks that it does not contain the email name.
    const problem = checkAdminPassword(next, '');
    if (problem) return setError(problem);
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    setError('');
    try {
      onChanged(await adminApi.changePassword(current, next));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await adminApi.logout().catch(() => undefined);
    onSignOut();
  }

  return (
    <Frame>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-7 shadow-2xl">
        <div>
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-lime-soft text-primary"><KeyRound className="h-5 w-5" /></span>
          <h1 className="font-display text-2xl font-bold tracking-tight">Choose your password</h1>
          <p className="mt-1 text-sm text-subtle">You signed in with a temporary password. Set your own to continue.</p>
        </div>
        <ErrorNote message={error} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Temporary password</span>
          <input className={INPUT} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">New password <span className="font-normal text-subtle">(at least 12 characters)</span></span>
          <input className={INPUT} type="password" autoComplete="new-password" required minLength={LIMITS.adminPassword.min} maxLength={LIMITS.adminPassword.max} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Confirm new password</span>
          <input className={INPUT} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save password and continue'}
        </Button>
        <button type="button" className="w-full text-center text-xs font-medium text-subtle hover:text-ink" onClick={signOut}>Sign out</button>
      </form>
    </Frame>
  );
}
