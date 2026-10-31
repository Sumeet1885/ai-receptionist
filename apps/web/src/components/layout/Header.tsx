import React, { useState } from 'react';
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';
import { UserMenu } from './UserMenu';
import { FolkNavBorder } from './FolkNavBorder';
import { publicTexture } from '../../lib/publicTexture';

interface HeaderProps {
  routeName: string;
  authMode?: string;
  navigate: (path: string) => void;
  user: any;
  signOut: () => Promise<void>;
}

const authedNav = [
  { label: 'Dashboard', path: '/dashboard', key: 'dashboard' },
  { label: 'Leads', path: '/leads', key: 'leads' },
  { label: 'Inbound Calls', path: '/inbound-calls', key: 'inbound-calls' },
  { label: 'Outbound Calls', path: '/outbound-calls', key: 'outbound-calls' },
  { label: 'Recordings', path: '/recordings', key: 'recordings' },
  { label: 'Calendar', path: '/calendar', key: 'calendar' },
  { label: 'Billing', path: '/billing', key: 'plans' },
];

// Signed-out pages (pricing, checkout, sign in, request access).
const publicNav = [
  { label: 'Home', path: '/', key: 'landing' },
  { label: 'Product', path: '/#product-persona', key: 'product' },
  { label: 'Pricing', path: '/pricing', key: 'pricing' },
];

/**
 * Avoid repeating the current page's action; keep checkout and confirmation focused.
 */
function publicActions(routeName: string) {
  const signIn = routeName !== 'auth' && routeName !== 'auth-confirm';
  const getStarted = !['request-access', 'checkout', 'auth-confirm'].includes(routeName);
  return { signIn, getStarted };
}

/** App navigation for every screen except the landing page (which has its own navbar). */
export const Header: React.FC<HeaderProps> = ({
  routeName,
  authMode,
  navigate,
  user,
  signOut
}: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (key: string) => {
    if (key === 'inbound-calls') return routeName === 'inbound-calls';
    if (key === 'outbound-calls') return routeName === 'outbound-calls';
    if (key === 'recordings') return routeName === 'recordings';
    if (key === 'pricing') return routeName === 'pricing' || routeName === 'checkout';
    return routeName === key;
  };
  const actions = publicActions(routeName);
  const navClass = (active: boolean) => `rounded-pill min-h-11 px-4 py-2 text-base transition-colors duration-[var(--duration-fast)] ${
    active ? 'bg-accent-lime font-semibold text-text' : 'font-medium text-text-subtle hover:bg-surface-sunken hover:text-text'
  }`;
  const mobileClass = (active: boolean) => `w-full rounded-small px-4 py-3 text-left text-base font-medium transition ${
    active ? 'bg-accent-lime text-text' : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
  }`;
  const go = (path: string) => {
    setMobileMenuOpen(false);
    // Landing sections are anchors on the landing page; everything else is an app route.
    if (path.startsWith('/#')) window.location.assign(path);
    else navigate(path);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setMobileMenuOpen(false);
      navigate('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Recovery sessions authorize a password change; keep this task separate from marketing/navigation.
  if (routeName === 'auth-confirm' || (routeName === 'auth' && authMode === 'reset')) {
    return <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-background px-[5%] py-4">
      <BrandLogo className="h-7 sm:h-9" />
      <span className="text-right text-xs font-medium text-text-subtle sm:text-sm">{authMode === 'reset' ? 'Password recovery' : 'Account verification'}</span>
    </header>;
  }

  return (
    <header style={user ? undefined : publicTexture('leaf')} className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background px-[5%] py-3 backdrop-blur-xl">
      {!user && <FolkNavBorder />}
      <a
        href={user ? '/dashboard' : '/'}
        onClick={(e) => {
          e.preventDefault();
          navigate(user ? '/dashboard' : '/');
        }}
        aria-label="Bolega India home"
        className="rounded-small"
      >
        <BrandLogo className="h-7 sm:h-9" />
      </a>

      <nav aria-label="Main" className="hidden 2xl:flex items-center gap-1 rounded-pill border border-border bg-surface p-1 text-base shadow-card">
        {(user ? authedNav : publicNav).map(item => (
          <a
            key={item.key}
            href={item.path}
            onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go(item.path); }}
            aria-current={isActive(item.key) ? 'page' : undefined}
            className={navClass(isActive(item.key))}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-2 sm:gap-4">
        {!user && actions.signIn && !actions.getStarted && (
          <Button variant="secondary" size="sm" className="2xl:hidden" onClick={() => navigate('/auth?mode=signin')}>
            Sign in
          </Button>
        )}
        {!user && actions.getStarted && <Button size="sm" className="px-2 text-xs 2xl:hidden" onClick={() => navigate('/request-access')}>7-day free trial</Button>}
        {user ? (
          <UserMenu email={user.email} navigate={navigate} signOut={() => void handleSignOut()} />
        ) : (
          <div className="hidden 2xl:flex items-center gap-2">
            {actions.signIn && (
              <Button variant={actions.getStarted ? 'ghost' : 'secondary'} size="md" className="text-base" onClick={() => navigate('/auth?mode=signin')}>
                Sign in
              </Button>
            )}
            {actions.getStarted && (
              <Button size="md" className="text-base" onClick={() => navigate('/request-access')}>
                7-day free trial
              </Button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-pill border border-border bg-surface p-2 text-text transition hover:bg-surface-sunken 2xl:hidden"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="app-mobile-menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileMenuOpen && (
        <nav
          id="app-mobile-menu"
          aria-label="Mobile"
          className="absolute left-0 right-0 top-full z-50 space-y-1 border-b border-border bg-background/95 px-4 py-4 shadow-floating backdrop-blur-md 2xl:hidden"
        >
          {user ? (
            <>
              {authedNav.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => go(item.path)}
                  aria-current={isActive(item.key) ? 'page' : undefined}
                  className={mobileClass(isActive(item.key))}
                >
                  {item.label}
                </button>
              ))}
              <div className="space-y-1 border-t border-border pt-2">
                <p className="truncate px-4 py-2 text-sm text-text-subtle">{user.email}</p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full rounded-small px-4 py-3 text-left text-base font-medium text-danger transition hover:bg-danger-surface"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              {publicNav.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => go(item.path)}
                  aria-current={isActive(item.key) ? 'page' : undefined}
                  className={mobileClass(isActive(item.key))}
                >
                  {item.label}
                </button>
              ))}
              {actions.signIn && (
                <button type="button" onClick={() => go('/auth?mode=signin')} className={mobileClass(false)}>
                  Sign in
                </button>
              )}
              {actions.getStarted && (
                <button
                  type="button"
                  onClick={() => go('/request-access')}
                  className="w-full rounded-small bg-text px-4 py-3 text-left text-sm font-semibold text-primary-foreground transition hover:bg-primary"
                >
                  7-day free trial
                </button>
              )}
            </>
          )}
        </nav>
      )}
    </header>
  );
};
