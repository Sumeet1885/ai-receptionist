import React, { useState } from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';

interface AuthViewProps {
  setView: (view: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  defaultMode?: 'signin' | 'signup';
}

export const AuthView: React.FC<AuthViewProps> = ({ setView, showToast, defaultMode = 'signin' }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return showToast("Please enter email and password", "error");
    
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        showToast("Account created successfully! Check your email if verification is required.", "success");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast("Signed in successfully!", "success");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'azure') => {
    const redirectTo = window.location.origin;
    if (provider === 'google') {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      });
    } else {
      await supabase.auth.signInWithOAuth({ 
        provider,
        options: {
          redirectTo
        }
      });
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-black min-h-[calc(100vh-80px)]">
      {/* Background decoration matching landing page */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-emerald-500/10 blur-[120px] rounded-[100%] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="bg-brand-card/80 backdrop-blur-xl border border-brand-border p-8 rounded-2xl shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-display font-bold text-brand-text mb-2">
              {mode === 'signin' ? 'Welcome back' : 'Create an account'}
            </h2>
            <p className="text-brand-muted">
              {mode === 'signin' 
                ? 'Sign in to access your virtual receptionist console.' 
                : 'Start building your AI employee today.'}
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <button 
              onClick={() => handleOAuth('google')}
              className="w-full py-3 px-4 bg-white text-black hover:bg-gray-100 rounded-lg font-semibold flex items-center justify-center space-x-3 transition duration-200"
            >
              <Icons.Google />
              <span>Continue with Google</span>
            </button>
            <button 
              onClick={() => handleOAuth('azure')}
              className="w-full py-3 px-4 bg-[#2f2f2f] text-white hover:bg-[#3f3f3f] border border-white/10 rounded-lg font-semibold flex items-center justify-center space-x-3 transition duration-200"
            >
              <Icons.Microsoft />
              <span>Continue with Microsoft</span>
            </button>
          </div>

          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-1 h-px bg-brand-border"></div>
            <span className="text-xs text-brand-muted uppercase tracking-wider">or email</span>
            <div className="flex-1 h-px bg-brand-border"></div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-black border border-brand-border rounded-lg px-4 py-2.5 text-brand-text focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition"
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-black border border-brand-border rounded-lg px-4 py-2.5 text-brand-text focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 text-black font-semibold rounded-lg shadow-md transition duration-200 mt-2 disabled:opacity-50"
            >
              {loading ? 'Please wait...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-brand-muted">
            {mode === 'signin' ? (
              <p>Don't have an account? <button onClick={() => setMode('signup')} className="text-emerald-400 hover:underline font-medium">Sign up</button></p>
            ) : (
              <p>Already have an account? <button onClick={() => setMode('signin')} className="text-emerald-400 hover:underline font-medium">Sign in</button></p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
