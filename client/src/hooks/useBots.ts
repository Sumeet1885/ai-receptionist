import { useState, useCallback } from 'react';
import { Bot, WidgetConfig } from '../types';
import { supabase } from '../lib/supabaseClient';
import { mergeWidgetConfig } from '../lib/widgetConfig';
import { BOT_SELECT_FIELDS } from '../lib/botQuery';

function mapBotFromDb(b: any): Bot {
  return {
    id: b.id,
    businessName: b.business_name,
    industry: b.industry,
    subDomain: b.subdomain,
    greeting: b.greeting,
    primaryColor: b.primary_color,
    languages: b.languages || ['English'],
    knowledgeBase: b.knowledge_base,
    allowedDomains: b.allowed_domains || [],
    widgetConfig: mergeWidgetConfig(b.widget_config),
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
    const { data } = await supabase
      .from('bots')
      .select(BOT_SELECT_FIELDS)
      .eq('owner_id', userId);
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
    knowledge_base: string;
    widget_config?: WidgetConfig;
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
  
  const updateBot = async (id: string, updates: Partial<{
    businessName: string;
    industry: string;
    greeting: string;
    primaryColor: string;
    knowledgeBase: string;
    allowedDomains: string[];
    widgetConfig: WidgetConfig;
  }>) => {
    const dbUpdates: any = {};
    if (updates.businessName !== undefined) dbUpdates.business_name = updates.businessName;
    if (updates.industry !== undefined) dbUpdates.industry = updates.industry;
    if (updates.greeting !== undefined) dbUpdates.greeting = updates.greeting;
    if (updates.primaryColor !== undefined) dbUpdates.primary_color = updates.primaryColor;
    if (updates.knowledgeBase !== undefined) dbUpdates.knowledge_base = updates.knowledgeBase;
    if (updates.allowedDomains !== undefined) dbUpdates.allowed_domains = updates.allowedDomains;
    if (updates.widgetConfig !== undefined) dbUpdates.widget_config = updates.widgetConfig;

    const { error } = await supabase
      .from('bots')
      .update(dbUpdates)
      .eq('id', id);

    if (error) throw error;

    setBots(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const deleteBot = async (id: string) => {
    const { error } = await supabase
      .from('bots')
      .delete()
      .eq('id', id);

    if (error) throw error;

    setBots(prev => {
      const nextBots = prev.filter(b => b.id !== id);
      setActiveBotId(currentId => currentId === id ? nextBots[0]?.id || '' : currentId);
      return nextBots;
    });
  };

  return { bots, setBots, activeBotId, setActiveBotId, fetchBots, createBot, updateBot, deleteBot };
}
