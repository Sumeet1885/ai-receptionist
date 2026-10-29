import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CreditCard, FileText, KeyRound, LifeBuoy, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { ChangePasswordDialog } from '../auth/ChangePasswordDialog';
import { openSupport } from '../../lib/supportDrawer';

export function UserMenu({
  email,
  signOut,
  navigate,
}: {
  email?: string;
  signOut: () => void;
  navigate: (path: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute('open');
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.removeAttribute('open');
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('keydown', key);
    };
  }, []);
  const act = (callback: () => void) => {
    ref.current?.removeAttribute('open');
    callback();
  };
  const item =
    'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-background';
  return (
    <><details ref={ref} className="relative">
      <summary
        aria-label="User menu"
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"
      >
        <UserRound size={18} />
        <span className="hidden max-w-36 truncate sm:inline">{email?.split('@')[0] || 'Your account'}</span>
        <ChevronDown size={15} />
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg">
        <p className="break-all border-b border-border px-3 py-3 text-sm text-text-subtle">{email}</p>
        <button type="button" className={item} onClick={() => act(() => navigate('/billing'))}>
          <CreditCard size={17} className="shrink-0" />
          <span>Billing<span className="block text-xs font-normal text-text-subtle">Transactions, plans &amp; minute top-ups</span></span>
        </button>
        <button type="button" className={item} onClick={() => act(() => setPasswordOpen(true))}><KeyRound size={17} /> Change password</button>
        <button type="button" className={item} onClick={() => act(() => openSupport({ view: 'tickets' }))}>
          <LifeBuoy size={17} /> Support tickets
        </button>
        <button type="button" className={item} onClick={() => act(() => navigate('/privacy'))}>
          <ShieldCheck size={17} /> Privacy policy
        </button>
        <button type="button" className={item} onClick={() => act(() => navigate('/terms'))}>
          <FileText size={17} /> Terms & conditions
        </button>
        <button
          type="button"
          className={`${item} border-t border-border text-danger`}
          onClick={() => act(signOut)}
        >
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </details>{passwordOpen && <ChangePasswordDialog email={email} onClose={() => setPasswordOpen(false)} />}</>
  );
}
