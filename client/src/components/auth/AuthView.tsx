import React, { useState, useEffect } from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

interface AuthViewProps {
  setView: (view: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  defaultMode?: AuthMode;
}

export const AuthView: React.FC<AuthViewProps> = ({ setView, showToast, defaultMode = 'signin' }) => {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    if (mode !== 'reset') {
      setSessionError(null);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      supabase.auth.exchangeCodeForSession(code).catch((err) => {
        // If already handled by detectSessionInUrl, ignore duplicate exchange warning
        console.warn('exchangeCodeForSession:', err?.message);
      });
    }
  }, [mode]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return showToast("Please enter email and password", "error");
    
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        localStorage.setItem('just_signed_up', 'true');
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return showToast("Please enter your email address", "error");

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth?mode=reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setResetSent(true);
      showToast("Password reset link sent! Please check your email.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to send reset link", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return showToast("Please enter a new password", "error");
    if (password !== confirmPassword) return showToast("Passwords do not match", "error");
    if (password.length < 6) return showToast("Password must be at least 6 characters", "error");

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active recovery session found. Your reset link may have expired. Please request a new one.");
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showToast("Password updated successfully! Welcome back.", "success");
      setPassword('');
      setConfirmPassword('');
      setView('dashboard');
    } catch (err: any) {
      const msg = err?.message || "Failed to update password";
      if (msg.includes("Auth session missing") || msg.includes("session")) {
        setSessionError("Your reset session has expired or is invalid. Please request a new password reset link.");
      }
      showToast(msg, "error");
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
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-black min-h-[calc(100vh-80px)]">
      {/* Background decoration matching landing page */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[800px] h-[300px] sm:h-[600px] bg-emerald-500/10 blur-[120px] rounded-[100%] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="bg-brand-card/80 backdrop-blur-xl border border-brand-border p-6 sm:p-8 rounded-2xl shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-display font-bold text-brand-text mb-2">
              {mode === 'signin' && 'Welcome back'}
              {mode === 'signup' && 'Create an account'}
              {mode === 'forgot' && 'Reset password'}
              {mode === 'reset' && 'Create new password'}
            </h2>
            <p className="text-brand-muted text-sm">
              {mode === 'signin' && 'Sign in to access your virtual receptionist console.'}
              {mode === 'signup' && 'Start building your AI employee today.'}
              {mode === 'forgot' && 'Enter your account email to receive a password recovery link.'}
              {mode === 'reset' && 'Please choose a secure new password for your account.'}
            </p>
          </div>

          {(mode === 'signin' || mode === 'signup') && (
            <>
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-brand-text">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setResetSent(false);
                          setMode('forgot');
                        }}
                        className="text-xs text-emerald-400 hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
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
            </>
          )}

          {mode === 'forgot' && (
            <div className="space-y-4">
              {resetSent ? (
                <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-lg font-bold">
                    ✓
                  </div>
                  <h3 className="text-sm font-bold text-emerald-300">Recovery Email Sent</h3>
                  <p className="text-xs text-emerald-200/80">
                    If an account exists for <span className="font-semibold text-white">{email}</span>, you will receive a password reset link shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-brand-text mb-1.5">Account Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full bg-black border border-brand-border rounded-lg px-4 py-2.5 text-brand-text focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition"
                      placeholder="name@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 text-black font-semibold rounded-lg shadow-md transition duration-200 disabled:opacity-50"
                  >
                    {loading ? 'Sending link...' : 'Send Reset Link'}
                  </button>
                </form>
              )}

              <div className="mt-6 text-center text-sm text-brand-muted">
                <button
                  type="button"
                  onClick={() => {
                    setResetSent(false);
                    setMode('signin');
                  }}
                  className="text-emerald-400 hover:underline font-medium"
                >
                  ← Back to Sign In
                </button>
              </div>
            </div>
          )}

          {mode === 'reset' && (
            sessionError ? (
              <div className="p-5 rounded-xl bg-red-950/40 border border-red-500/30 text-center space-y-4">
                <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-lg font-bold">
                  !
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-red-300">Session Expired or Missing</h3>
                  <p className="text-xs text-red-200/80 leading-relaxed">
                    {sessionError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSessionError(null);
                    setMode('forgot');
                  }}
                  className="w-full py-2.5 px-4 bg-emerald-400 hover:bg-emerald-300 text-black font-semibold rounded-lg text-sm shadow-md transition duration-200"
                >
                  Request New Reset Link
                </button>
                <div className="pt-2 text-center text-sm text-brand-muted">
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="text-emerald-400 hover:underline font-medium text-xs"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1.5">New Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-black border border-brand-border rounded-lg px-4 py-2.5 text-brand-text focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition"
                    placeholder="At least 6 characters"
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-black border border-brand-border rounded-lg px-4 py-2.5 text-brand-text focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition"
                    placeholder="Re-enter your new password"
                    minLength={6}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 text-black font-semibold rounded-lg shadow-md transition duration-200 mt-2 disabled:opacity-50"
                >
                  {loading ? 'Updating password...' : 'Update Password'}
                </button>
                <div className="mt-6 text-center text-sm text-brand-muted">
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="text-emerald-400 hover:underline font-medium"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            )
          )}
        </div>
      </div>
    </div>
  );
};
