import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
function mapBotFromDb(b) {
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
    const [bots, setBots] = useState([]);
    const [activeBotId, setActiveBotId] = useState('');
    const fetchBots = useCallback(async () => {
        const { data } = await supabase.from('bots').select('*');
        if (data && data.length > 0) {
            const mapped = data.map(mapBotFromDb);
            setBots(mapped);
            if (!activeBotId)
                setActiveBotId(mapped[0].id);
        }
    }, [activeBotId]);
    const createBot = async (payload) => {
        const { data, error } = await supabase
            .from('bots')
            .insert([payload])
            .select('*')
            .single();
        if (error || !data)
            throw error;
        await fetchBots();
        setActiveBotId(data.id);
        return data.id;
    };
    return { bots, setBots, activeBotId, setActiveBotId, fetchBots, createBot };
}
