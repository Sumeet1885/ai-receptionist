import React from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';

interface HeaderProps {
  view: string;
  setView: (view: string) => void;
  hasBots: boolean;
  activeBotId: string;
  launchPublicChat: (botId: string) => void;
  user: any;
  signOut: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  view,
  setView,
  user,
  signOut
}: HeaderProps) => {
  const isLanding = view === 'landing';

  const handleSignInGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/calendar',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <header className={`sticky top-0 z-40 backdrop-blur-md px-6 flex items-center justify-between ${
      isLanding
        ? 'bg-black/95 border-b border-white/10 py-3'
        : 'bg-brand-bg/90 border-b border-brand-border py-4'
    }`}>
      <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView('landing')}>
        <div className={`p-2 border rounded-lg shadow-sm transition hover:scale-105 ${
          isLanding
            ? 'bg-white/5 border-white/10 text-emerald-400'
            : 'bg-brand-accent/10 border-brand-border text-brand-accent'
        }`}>
          <Icons.Bot />
        </div>
        <div>
          <h1 className="text-xl font-display font-extrabold tracking-tight text-brand-text">
            Receptionist<span className={isLanding ? 'text-emerald-400' : 'text-brand-accent'}>.ai</span>
          </h1>
          <p className="text-[10px] text-brand-muted font-mono tracking-wider uppercase font-semibold">Enterprise Agent Portal</p>
        </div>
      </div>

      <nav className="hidden md:flex items-center space-x-6 text-sm font-sans font-medium">
        <button 
          onClick={() => setView('landing')} 
          className={`hover:text-brand-text transition-colors duration-200 pb-1 border-b-2 ${view === 'landing' ? `text-brand-text ${isLanding ? 'border-emerald-400' : 'border-brand-accent'} font-semibold` : 'text-brand-muted border-transparent'}`}
        >
          Features
        </button>
        {user && (
          <>
            <button 
              onClick={() => setView('onboarding')} 
              className={`hover:text-brand-text transition-colors duration-200 pb-1 border-b-2 ${view === 'onboarding' ? 'text-brand-text border-brand-accent font-semibold' : 'text-brand-muted border-transparent'}`}
            >
              Configure Agent
            </button>
            <button 
              onClick={() => setView('dashboard')} 
              className={`hover:text-brand-text transition-colors duration-200 pb-1 border-b-2 ${view === 'dashboard' ? 'text-brand-text border-brand-accent font-semibold' : 'text-brand-muted border-transparent'}`}
            >
              Console
            </button>
          </>
        )}
      </nav>

      <div className="flex items-center space-x-4">
        {user ? (
          <div className="flex items-center space-x-4">
            <span className="text-sm text-brand-muted hidden sm:inline-block">{user.email}</span>
            <button
              onClick={handleSignOut}
              className={`px-4 py-2 font-sans font-semibold text-sm rounded-lg shadow-sm transition duration-200 border ${
                isLanding
                  ? 'border-white/10 hover:bg-white/5 text-white'
                  : 'border-brand-border hover:bg-brand-card text-brand-text'
              }`}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setView('auth-signin')}
              className={`px-4 py-2 font-sans font-semibold text-sm rounded-lg transition duration-200 ${
                isLanding ? 'text-brand-muted hover:text-white' : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setView('auth-signup')}
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
      </div>
    </header>
  );
};
