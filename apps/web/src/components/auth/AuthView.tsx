import React, { useState, useEffect } from 'react';
import { Icons } from '../common/Icons';
import { BrandLogo } from '../ui/brand-logo';
import { Button } from '../ui/button';
import { Input, Label } from '../ui/field';
import { Card } from '../ui/layout';
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
      // 1. If URL has code parameter, make sure code exchange completes
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // If already exchanged, proceed
        }
      }

      // 2. Directly update user password using current recovery session
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      showToast("Password updated successfully! Welcome back.", "success");
      setPassword('');
      setConfirmPassword('');
      setSessionError(null);
      setView('dashboard');
    } catch (err: any) {
      const msg = err?.message || "Failed to update password";
      if (msg.includes("Auth session missing") || msg.includes("session")) {
        setSessionError("Your reset link has expired or is invalid. Please request a new password reset link below.");
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

  const titles: Record<AuthMode, { title: string; description: string }> = {
    signin: { title: 'Welcome back', description: 'Sign in to your Bolega India workspace.' },
    signup: { title: 'Create your account', description: 'Set up your business persona and start your first campaign.' },
    forgot: { title: 'Reset password', description: 'Enter your account email to receive a password recovery link.' },
    reset: { title: 'Create a new password', description: 'Please choose a secure new password for your account.' },
  };

  const backToSignIn = (
    <button
      type="button"
      onClick={() => {
        setResetSent(false);
        setSessionError(null);
        setMode('signin');
      }}
      className="font-medium text-primary hover:underline"
    >
      ← Back to sign in
    </button>
  );

  return (
    <div className="relative flex min-h-[calc(100vh-80px)] flex-1 items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      {/* Soft lime glow, as behind the landing hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-accent-lime/30 blur-[120px] sm:h-[600px] sm:w-[800px]"
      />

      <div className="relative z-10 w-full max-w-md">
        <Card variant="floating" padding="lg" className="rounded-large">
          <div className="mb-8 text-center">
            <BrandLogo className="mb-6 justify-center" />
            <h1 className="mb-2 font-display text-3xl font-semibold tracking-[-0.04em] text-text">{titles[mode].title}</h1>
            <p className="text-sm text-text-subtle">{titles[mode].description}</p>
          </div>

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <div className="mb-6 space-y-3">
                <Button variant="secondary" size="lg" className="w-full" onClick={() => handleOAuth('google')}>
                  <Icons.Google />
                  <span>Continue with Google</span>
                </Button>
                <Button variant="secondary" size="lg" className="w-full" onClick={() => handleOAuth('azure')}>
                  <Icons.Microsoft />
                  <span>Continue with Microsoft</span>
                </Button>
              </div>

              <div className="mb-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">or email</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <Label htmlFor="auth-email">Email address</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label htmlFor="auth-password" className="mb-0">Password</Label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setResetSent(false);
                          setMode('forgot');
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="auth-password"
                    type="password"
                    required
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
                  {loading ? 'Please wait…' : (mode === 'signin' ? 'Sign in' : 'Create account')}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-text-subtle">
                {mode === 'signin' ? (
                  <p>Don&apos;t have an account? <button type="button" onClick={() => setMode('signup')} className="font-medium text-primary hover:underline">Sign up</button></p>
                ) : (
                  <p>Already have an account? <button type="button" onClick={() => setMode('signin')} className="font-medium text-primary hover:underline">Sign in</button></p>
                )}
              </div>
            </>
          )}

          {mode === 'forgot' && (
            <div className="space-y-4">
              {resetSent ? (
                <div role="status" className="space-y-2 rounded-medium border border-success/30 bg-success-surface p-4 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-lg font-bold text-success" aria-hidden="true">
                    ✓
                  </div>
                  <h2 className="text-sm font-bold text-success">Recovery email sent</h2>
                  <p className="text-xs text-text">
                    If an account exists for <span className="font-semibold">{email}</span>, you will receive a password reset link shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <Label htmlFor="auth-recovery-email">Account email</Label>
                    <Input
                      id="auth-recovery-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@company.com"
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full" disabled={loading}>
                    {loading ? 'Sending link…' : 'Send reset link'}
                  </Button>
                </form>
              )}

              <div className="mt-6 text-center text-sm">{backToSignIn}</div>
            </div>
          )}

          {mode === 'reset' && (
            sessionError ? (
              <div role="alert" className="space-y-4 rounded-medium border border-danger/30 bg-danger-surface p-5 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-danger/15 text-lg font-bold text-danger" aria-hidden="true">
                  !
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-danger">Session expired or missing</h2>
                  <p className="text-xs leading-relaxed text-text">{sessionError}</p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setSessionError(null);
                    setMode('forgot');
                  }}
                >
                  Request new reset link
                </Button>
                <div className="pt-2 text-center text-xs">{backToSignIn}</div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="auth-new-password">New password</Label>
                  <Input
                    id="auth-new-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                  />
                </div>
                <div>
                  <Label htmlFor="auth-confirm-password">Confirm new password</Label>
                  <Input
                    id="auth-confirm-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    minLength={6}
                  />
                </div>
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
                  {loading ? 'Updating password…' : 'Update password'}
                </Button>
                <div className="mt-6 text-center text-sm">{backToSignIn}</div>
              </form>
            )
          )}
        </Card>
      </div>
    </div>
  );
};
