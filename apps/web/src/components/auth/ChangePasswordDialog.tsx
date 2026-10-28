import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X } from 'lucide-react';
import { checkCustomerPassword, LIMITS } from '@ai-receptionist/contracts';
import { accountApi } from '../../lib/accountApi';
import { PasswordInput } from '../ui/password-input';
import { Label } from '../ui/field';
import { Button } from '../ui/button';

export function ChangePasswordDialog({ email, onClose }: { email?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = checkCustomerPassword(password, email);
    if (!current) return setError('Enter your current password.');
    if (problem) return setError(problem);
    if (password === current) return setError('Choose a password different from your current password.');
    if (password !== confirm) return setError('The passwords do not match.');
    setBusy(true); setError('');
    try { await accountApi.changePassword(current, password); setCurrent(''); setPassword(''); setConfirm(''); setDone(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return createPortal(<dialog ref={ref} onCancel={onClose} onClose={onClose} aria-labelledby="change-password-title" className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/35">
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <h2 id="change-password-title" className="flex items-center gap-2 font-display text-xl font-semibold"><KeyRound size={20} />Change password</h2>
      <button type="button" onClick={onClose} aria-label="Close change password" className="rounded-lg p-2 hover:bg-background"><X size={20} /></button>
    </div>
    {done ? <div className="space-y-5 p-5"><p role="status" className="text-success">Your password has been changed successfully.</p><Button className="w-full" onClick={onClose}>Done</Button></div> : <form onSubmit={submit} className="space-y-4 p-5">
      <div><Label htmlFor="change-current-password">Current password</Label><PasswordInput id="change-current-password" autoComplete="current-password" required maxLength={LIMITS.customerPassword.max} disabled={busy} value={current} onChange={e => setCurrent(e.target.value)} /></div>
      <div><Label htmlFor="change-new-password">New password</Label><PasswordInput id="change-new-password" autoComplete="new-password" required minLength={LIMITS.customerPassword.min} maxLength={LIMITS.customerPassword.max} disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /><p className="mt-1 text-xs text-text-subtle">At least {LIMITS.customerPassword.min} characters. Choose a unique password.</p></div>
      <div><Label htmlFor="change-confirm-password">Confirm new password</Label><PasswordInput id="change-confirm-password" autoComplete="new-password" required maxLength={LIMITS.customerPassword.max} disabled={busy} value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Updating...' : 'Update password'}</Button></div>
    </form>}
  </dialog>, document.body);
}
