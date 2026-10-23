import React, { useState } from 'react';
import { Icons } from '../common/Icons';

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

export const Header: React.FC<HeaderProps> = ({
  routeName,
  navigate,
  user,
  signOut
}: HeaderProps) => {
  const isLanding = routeName === 'landing';
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
    <header className={`sticky top-0 z-40 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between transition-all duration-300 ${
      isLanding
        ? 'bg-black/90 border-b border-white/10 py-3 shadow-lg'
        : 'bg-brand-bg/80 border-b border-brand-border/60 py-3.5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]'
    }`}>
      <div className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer group" onClick={() => navigate(user ? '/dashboard' : '/')}>
        <div className={`p-2 border rounded-xl shadow-sm transition-all duration-300 group-hover:scale-105 ${
          isLanding
            ? 'bg-white/5 border-white/10 text-emerald-400 group-hover:border-emerald-400/40'
            : 'bg-brand-accent/10 border-brand-border text-brand-accent group-hover:border-brand-accent/50 group-hover:shadow-[0_0_15px_rgba(25,233,157,0.25)]'
        }`}>
          <Icons.Bot />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-display font-black tracking-tight text-brand-text flex items-center gap-1">
            Receptionist<span className={isLanding ? 'text-emerald-400' : 'text-brand-accent'}>.ai</span>
          </h1>
          <p className="text-[8px] sm:text-[9px] text-brand-muted font-mono tracking-wider uppercase font-semibold">Real Estate Voice AI</p>
        </div>
      </div>

      <nav className="hidden md:flex items-center space-x-1.5 text-xs font-sans p-1 rounded-full bg-brand-bg/60 border border-brand-border/50 backdrop-blur-md">
        {user ? (
          authedNav.map(item => (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className={`px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                isActive(item.key)
                  ? 'text-brand-accent bg-brand-accent/15 border border-brand-accent/35 font-bold shadow-[0_0_12px_rgba(25,233,157,0.2)]'
                  : 'text-brand-muted hover:text-brand-text hover:bg-white/[0.04] font-medium'
              }`}
            >
              {item.label}
            </button>
          ))
        ) : (
          <button
            onClick={() => navigate('/')}
            className={`px-3.5 py-1.5 rounded-full transition-all ${routeName === 'landing' ? `text-brand-accent bg-brand-accent/15 border border-brand-accent/35 font-bold` : 'text-brand-muted hover:text-brand-text font-medium'}`}
          >
            Features
          </button>
        )}
      </nav>

      <div className="flex items-center gap-2 sm:gap-4">
        {user ? (
          <div className="hidden md:flex items-center gap-3">
            <span className="text-xs text-brand-muted font-mono max-w-[150px] truncate">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 font-sans font-semibold text-xs rounded-lg transition duration-200 border border-brand-border hover:border-brand-accent/40 hover:bg-brand-card text-brand-text"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate('/auth?mode=signin')}
              className={`px-4 py-2 font-sans font-semibold text-sm rounded-lg transition duration-200 ${
                isLanding ? 'text-brand-muted hover:text-white' : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/auth?mode=signup')}
              className={`px-4 py-2 font-sans font-semibold text-sm rounded-lg shadow-md hover:shadow-lg transition duration-200 ${
                isLanding
                  ? 'bg-emerald-400 hover:bg-emerald-300 text-black'
                  : 'bg-brand-accent hover:bg-brand-accent-hover text-brand-text'
              }`}
            >
              Create an account
            </button>
          </div>
        )}

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`md:hidden p-2 rounded-lg border transition ${
            isLanding
              ? 'border-white/10 hover:bg-white/5 text-white'
              : 'border-brand-border hover:bg-brand-card text-brand-text'
          }`}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className={`absolute top-full left-0 right-0 z-50 md:hidden ${
          isLanding ? 'bg-black/95 border-b border-white/10' : 'bg-brand-bg/95 border-b border-brand-border'
        } backdrop-blur-md px-4 py-4 space-y-2 shadow-xl`}>
          {user ? (
            <>
              {authedNav.map(item => (
                <button
                  key={item.key}
                  onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-sans font-medium transition ${
                    isActive(item.key) ? 'bg-brand-accent/10 text-brand-accent' : 'text-brand-muted hover:bg-brand-card hover:text-brand-text'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <div className="pt-2 border-t border-brand-border space-y-2">
                <p className="px-4 py-2 text-xs text-brand-muted truncate">{user.email}</p>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-3 rounded-lg text-sm font-sans font-medium text-brand-danger hover:bg-brand-danger/10 transition"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => { navigate('/'); setMobileMenuOpen(false); }}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-sans font-medium transition ${
                  routeName === 'landing' ? 'bg-brand-accent/10 text-brand-accent' : 'text-brand-muted hover:bg-brand-card hover:text-brand-text'
                }`}
              >
                Features
              </button>
              <button
                onClick={() => { navigate('/auth?mode=signin'); setMobileMenuOpen(false); }}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-sans font-medium text-brand-muted hover:bg-brand-card hover:text-brand-text transition"
              >
                Sign In
              </button>
              <button
                onClick={() => { navigate('/auth?mode=signup'); setMobileMenuOpen(false); }}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-sans font-medium bg-brand-accent hover:bg-brand-accent-hover text-brand-text transition"
              >
                Create an account
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
