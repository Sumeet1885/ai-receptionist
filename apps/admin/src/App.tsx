// Staff console. Authentication is server-side (apps/api /api/admin, httpOnly session cookie);
// this app never talks to Supabase. See docs/modernization/03-admin-auth.md.
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, staffApi, type StaffSession } from './api';

type View = { name: 'loading' } | { name: 'signed-out' } | { name: 'signed-in'; session: StaffSession };

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' });

  useEffect(() => {
    staffApi.me()
      .then((session) => setView({ name: 'signed-in', session }))
      .catch(() => setView({ name: 'signed-out' }));
  }, []);

  if (view.name === 'loading') return <main className="center"><p className="muted">Loading…</p></main>;
  if (view.name === 'signed-out') {
    return <LoginForm onSignedIn={(session) => setView({ name: 'signed-in', session })} />;
  }
  if (view.session.principal.mustChangePassword) {
    return (
      <ChangePasswordForm
        forced
        onChanged={(session) => setView({ name: 'signed-in', session })}
        onSignOut={() => setView({ name: 'signed-out' })}
      />
    );
  }
  return <Console session={view.session} onSignedOut={() => setView({ name: 'signed-out' })} />;
}

function Brand() {
  return (
    <p className="brand">
      Bolega India <span>Staff console</span>
    </p>
  );
}

function LoginForm({ onSignedIn }: { onSignedIn: (session: StaffSession) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await staffApi.login(email, password));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'Too many attempts. Try again in a few minutes.' : (err as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <form className="card" onSubmit={submit}>
        <Brand />
        <h1>Sign in</h1>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">Staff accounts are created by an administrator. There is no self-signup.</p>
      </form>
    </main>
  );
}

function ChangePasswordForm({ forced, onChanged, onSignOut }: {
  forced?: boolean;
  onChanged: (session: StaffSession) => void;
  onSignOut: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    setError('');
    try {
      onChanged(await staffApi.changePassword(current, next));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await staffApi.logout().catch(() => undefined);
    onSignOut();
  }

  return (
    <main className="center">
      <form className="card" onSubmit={submit}>
        <Brand />
        <h1>Set a new password</h1>
        {forced && <p className="muted">You signed in with a temporary password. Choose your own to continue.</p>}
        <label>
          Current password
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label>
          New password <span className="muted small">(at least 12 characters)</span>
          <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label>
          Confirm new password
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        <button type="button" className="link" onClick={signOut}>Sign out</button>
      </form>
    </main>
  );
}

function Console({ session, onSignedOut }: { session: StaffSession; onSignedOut: () => void }) {
  async function signOut() {
    await staffApi.logout().catch(() => undefined);
    onSignedOut();
  }

  return (
    <div className="shell">
      <header>
        <Brand />
        <div className="who">
          <span>{session.principal.displayName}</span>
          <span className="muted small">{session.roles.join(', ') || 'no role'}</span>
          <button type="button" className="secondary" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main>
        <h1>Welcome, {session.principal.displayName}</h1>
        <p className="muted">Signed in as {session.principal.email}.</p>
        <section className="card wide">
          <h2>Access requests</h2>
          <p className="muted">Reviewing and approving free-access requests arrives in the next package.</p>
        </section>
      </main>
    </div>
  );
}
