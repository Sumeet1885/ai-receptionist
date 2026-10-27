import React, { useState } from 'react';
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';

interface HeaderProps {
  routeName: string;
  navigate: (path: string) => void;
  user: any;
  signOut: () => Promise<void>;
}

const authedNav = [
  { label: 'Dashboard', path: '/dashboard', key: 'dashboard' },
  { label: 'Leads', path: '/leads', key: 'leads' },
  { label: 'Inbox', path: '/inbox', key: 'inbox' },
  { label: 'Calendar', path: '/calendar', key: 'calendar' },
  { label: 'Calls', path: '/calls', key: 'calls' },
  { label: 'Agents', path: '/agents', key: 'agents' },
  { label: 'Plans', path: '/plans', key: 'plans' }
];

/** App navigation for every screen except the landing page (which has its own navbar). */
export const Header: React.FC<HeaderProps> = ({
  routeName,
  navigate,
  user,
  signOut
}: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (key: string) => {
    if (key === 'agents') return routeName === 'agents' || routeName === 'agent-detail' || routeName === 'agent-new';
    return routeName === key;
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

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-6">
      <a
        href={user ? '/dashboard' : '/'}
        onClick={(e) => {
          e.preventDefault();
          navigate(user ? '/dashboard' : '/');
        }}
        aria-label="Bolega India home"
        className="rounded-small"
      >
        <BrandLogo />
      </a>

      {user && (
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1 rounded-pill border border-border bg-surface p-1 text-xs shadow-card">
          {authedNav.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.path)}
              aria-current={isActive(item.key) ? 'page' : undefined}
              className={`rounded-pill px-3.5 py-1.5 transition-colors duration-[var(--duration-fast)] ${
                isActive(item.key)
                  ? 'bg-accent-lime font-semibold text-text'
                  : 'font-medium text-text-subtle hover:bg-surface-sunken hover:text-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-2 sm:gap-4">
        {user ? (
          <div className="hidden lg:flex items-center gap-3">
            <span className="max-w-[180px] truncate text-xs text-text-subtle">{user.email}</span>
            <Button variant="secondary" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/auth?mode=signin')}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => navigate('/request-access')}>
              Get started ↗
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-pill border border-border bg-surface p-2 text-text transition hover:bg-surface-sunken lg:hidden"
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
          className="absolute left-0 right-0 top-full z-50 space-y-1 border-b border-border bg-background/95 px-4 py-4 shadow-floating backdrop-blur-md lg:hidden"
        >
          {user ? (
            <>
              {authedNav.map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                  aria-current={isActive(item.key) ? 'page' : undefined}
                  className={`w-full rounded-small px-4 py-3 text-left text-sm font-medium transition ${
                    isActive(item.key) ? 'bg-accent-lime text-text' : 'text-text-subtle hover:bg-surface-sunken hover:text-text'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <div className="space-y-1 border-t border-border pt-2">
                <p className="truncate px-4 py-2 text-xs text-text-subtle">{user.email}</p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full rounded-small px-4 py-3 text-left text-sm font-medium text-danger transition hover:bg-danger-surface"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { navigate('/'); setMobileMenuOpen(false); }}
                className="w-full rounded-small px-4 py-3 text-left text-sm font-medium text-text-subtle transition hover:bg-surface-sunken hover:text-text"
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => { navigate('/auth?mode=signin'); setMobileMenuOpen(false); }}
                className="w-full rounded-small px-4 py-3 text-left text-sm font-medium text-text-subtle transition hover:bg-surface-sunken hover:text-text"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { navigate('/request-access'); setMobileMenuOpen(false); }}
                className="w-full rounded-small bg-text px-4 py-3 text-left text-sm font-semibold text-primary-foreground transition hover:bg-primary"
              >
                Get started ↗
              </button>
            </>
          )}
        </nav>
      )}
    </header>
  );
};
