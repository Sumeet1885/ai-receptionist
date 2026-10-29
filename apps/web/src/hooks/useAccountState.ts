import { useCallback, useEffect, useState } from 'react';
import { accountApi, type AccountStage } from '../lib/accountApi';

/**
 * The signed-in user's lifecycle stage from the API. `stage` is null while loading or signed out;
 * `error` is set when the stage cannot be loaded, and the app then shows no workspace (fail closed).
 */
export function useAccountState(userId: string | null) {
  const [stage, setStage] = useState<AccountStage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      const result = await accountApi.state();
      setStage(result.stage);
      setStartsAt(result.accessStartsAt || null);
      setExpiresAt(result.accessExpiresAt || null);
      setTrialEndsAt(result.trialEndsAt || null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setStage(null);
    setError(null);
    setExpiresAt(null);
    setStartsAt(null);
    setTrialEndsAt(null);
    if (userId) void refresh();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    const focus = () => { void refresh(true); };
    const interval = window.setInterval(focus, 30_000);
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [userId, refresh]);
  useEffect(() => {
    if (!expiresAt || !['active', 'onboarding'].includes(stage || '')) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) { setStage('payment_required'); return; }
    const timer = window.setTimeout(() => { if (Date.parse(expiresAt) <= Date.now()) setStage('payment_required'); void refresh(true); }, Math.min(remaining + 10, 2147483647));
    return () => window.clearTimeout(timer);
  }, [expiresAt, stage, refresh]);

  useEffect(() => {
    if (stage !== 'scheduled' || !startsAt) return;
    const remaining = Date.parse(startsAt) - Date.now();
    const timer = window.setTimeout(() => { void refresh(true); }, Math.max(100, Math.min(remaining + 10, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [stage, startsAt, refresh]);

  return { startsAt, stage, setStage, expiresAt, trialEndsAt, loading: Boolean(userId) && (loading || (!stage && !error)), error, refresh };
}
