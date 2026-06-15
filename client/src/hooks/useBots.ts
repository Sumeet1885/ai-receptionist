import { useState, useCallback } from 'react';
import { Bot } from '../types';
import { supabase } from '../lib/supabaseClient';

function mapBotFromDb(b: any): Bot {
  return {
    id: b.id,
    businessName: b.business_name,
    industry: b.industry,
    subDomain: b.subdomain,
    greeting: b.greeting,
    primaryColor: b.primary_color,
    languages: b.languages,
    knowledgeBase: b.knowledge_base,
    createdAt: b.created_at
  };
}

export function useBots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [activeBotId, setActiveBotId] = useState<string>('');

  const fetchBots = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      setBots([]);
      return;
    }
    const { data } = await supabase.from('bots').select('*').eq('owner_id', userId);
    if (data) {
      const mapped = data.map(mapBotFromDb);
      setBots(mapped);
      if (mapped.length > 0) {
        setActiveBotId(currentId => currentId || mapped[0].id);
      }
    } else {
      setBots([]);
    }
  }, []);

  const createBot = async (payload: {
    owner_id: string;
    business_name: string;
    industry: string;
    subdomain: string;
    greeting: string;
    primary_color: string;
    languages: string[];
    knowledge_base: string;
  }) => {
    const { data, error } = await supabase
      .from('bots')
      .insert([payload])
      .select('*')
      .single();

    if (error || !data) throw error;

    await fetchBots();
    setActiveBotId(data.id);
    return data.id;
  };

  return { bots, setBots, activeBotId, setActiveBotId, fetchBots, createBot };
}
