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
    const { data } = await supabase.from('bots').select('*');
    if (data && data.length > 0) {
      const mapped = data.map(mapBotFromDb);
      setBots(mapped);
      if (!activeBotId) setActiveBotId(mapped[0].id);
    }
  }, [activeBotId]);

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
