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

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await accountApi.state();
      setStage(result.stage);
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
    if (userId) void refresh();
  }, [userId, refresh]);

  return { stage, setStage, loading: Boolean(userId) && (loading || (!stage && !error)), error, refresh };
}
