// Admin console. Authentication is server-side (apps/api /api/admin, httpOnly session cookie);
// this app never talks to Supabase. See docs/modernization/03-admin-auth.md.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { adminApi, type AdminSession } from './api';
import { ChangePasswordScreen, LoginScreen } from './AuthScreens';
import { AccessRequests } from './pages/AccessRequests';
import { Coupons } from './pages/Coupons';
import { Overview } from './pages/Overview';
import { Payments } from './pages/Payments';
import { Plans } from './pages/Plans';
import { usePage } from './router';
import { Shell } from './Shell';
import { ToastProvider } from './toast';

type View = { name: 'loading' } | { name: 'signed-out' } | { name: 'signed-in'; session: AdminSession };

export default function App() {
  const [view, setView] = useState<View>({ name: 'loading' });
  const page = usePage();

  useEffect(() => {
    adminApi.me()
      .then((session) => setView({ name: 'signed-in', session }))
      .catch(() => setView({ name: 'signed-out' }));
  }, []);

  const signedIn = (session: AdminSession) => setView({ name: 'signed-in', session });
  const signedOut = () => setView({ name: 'signed-out' });

  if (view.name === 'loading') {
    return (
      <main className="flex h-full items-center justify-center text-subtle">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }
  if (view.name === 'signed-out') return <LoginScreen onSignedIn={signedIn} />;
  if (view.session.adminUser.mustChangePassword) return <ChangePasswordScreen onChanged={signedIn} onSignOut={signedOut} />;

  return (
    <ToastProvider>
      <Shell session={view.session} page={page} onSignedOut={signedOut}>
        {page === 'requests' ? <AccessRequests key="requests" roles={view.session.roles} />
          : page === 'plans' ? <Plans roles={view.session.roles} />
          : page === 'coupons' ? <Coupons roles={view.session.roles} />
          : page === 'payments' ? <Payments />
          : <Overview session={view.session} />}
      </Shell>
    </ToastProvider>
  );
}
