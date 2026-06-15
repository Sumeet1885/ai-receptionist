import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { seedDemoDataForUser } from '../services/seedDemo';

const saveProviderTokens = async (session: any) => {
  if (!session) return;
  const provider = session.user?.app_metadata?.provider;
  if (provider !== 'google' && provider !== 'azure') return;

  const mappedProvider = provider === 'azure' ? 'outlook' : 'google';
  const expiresAt = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null;

  try {
    const providerToken = session.provider_token;
    const providerRefreshToken = session.provider_refresh_token;

    if (!providerToken) return;

    // Upsert the calendar connection
    await supabase
      .from('calendar_connections')
      .upsert({
        owner_id: session.user.id,
        provider: mappedProvider,
        access_token: providerToken,
        refresh_token: providerRefreshToken || undefined,
        token_expires_at: expiresAt,
        calendar_id: 'primary'
      }, { onConflict: 'owner_id, provider' });
  } catch (err) {
    console.error('Error saving provider calendar tokens:', err);
  }
};

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session) {
        await saveProviderTokens(session);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      setLoading(false);
      if (session) {
        await saveProviderTokens(session);
      }
      if (newUser) {
        await seedDemoDataForUser(newUser.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { user, loading, signOut };
}
