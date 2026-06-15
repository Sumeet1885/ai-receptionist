import { supabase } from '../lib/supabaseClient';
/**
 * Seeds initial demo data for a newly registered user so their dashboard isn't empty.
 */
export async function seedDemoDataForUser(userId) {
    try {
        // 1. Check if the user already has bots
        const { data: existingBots, error: botCheckError } = await supabase
            .from('bots')
            .select('id')
            .eq('owner_id', userId);
        if (botCheckError)
            throw botCheckError;
        if (existingBots && existingBots.length > 0) {
            console.log('User already has bots, skipping seeding.');
            return;
        }
        // 2. Create a default Demo Bot
        const demoBot = {
            owner_id: userId,
            business_name: 'Apex Horizon Estates (Demo)',
            industry: 'Real Estate',
            subdomain: `demo-apex-${Math.floor(Math.random() * 10000)}`,
            greeting: 'Welcome to Apex Horizon Estates! 🏢 Interested in our premium high-rise projects, commercial spaces, or planning a direct site visit?',
            primary_color: 'indigo',
            languages: ['English'],
            knowledge_base: 'Apex Horizon Estates portfolio details:\n1. Active Project: "Horizon Heights" located in Kharadi, Pune.\n- Configurations: premium 2 BHK (INR 85 Lakhs onwards) and 3 BHK (INR 1.25 Cr onwards) spacious apartments.\n- Amenities: Infinite swimming pool, sky garden, fully equipped modern gym, and multi-tier security.\n2. Site Visits: Open daily from 9:00 AM to 7:00 PM. High-priority buyers get a free cab pickup and drop service.'
        };
        const { data: botData, error: botInsertError } = await supabase
            .from('bots')
            .insert([demoBot])
            .select('id')
            .single();
        if (botInsertError || !botData) {
            console.error('Failed to create demo bot:', botInsertError);
            return;
        }
        const botId = botData.id;
        // 3. Create a dummy chat session
        const { data: sessionData, error: sessionInsertError } = await supabase
            .from('chat_sessions')
            .insert([{ bot_id: botId, visitor_id: 'demo-visitor' }])
            .select('id')
            .single();
        if (sessionInsertError || !sessionData) {
            console.error('Failed to create demo chat session:', sessionInsertError);
            return;
        }
        const sessionId = sessionData.id;
        // 4. Insert dummy messages
        await supabase.from('messages').insert([
            { session_id: sessionId, sender: 'bot', content: demoBot.greeting },
            { session_id: sessionId, sender: 'user', content: 'I am looking for a 2 BHK apartment near Kharadi. My budget is around 90 Lakhs. My name is Amit and my number is 9881234567.' },
            { session_id: sessionId, sender: 'bot', content: 'Thank you Amit. We have excellent 2 BHK options in Horizon Heights starting at 85 Lakhs. I will arrange a site visit for you.' }
        ]);
        // 5. Insert a dummy lead
        await supabase.from('leads').insert([{
                bot_id: botId,
                session_id: sessionId,
                name: 'Amit Deshmukh (Demo)',
                phone: '+91 98812 34567',
                requirement: '2 BHK in Kharadi',
                budget: '90 Lakhs',
                sentiment: 'Positive',
                lead_score: 'HOT',
                summary: 'High-intent visitor asked for 2 BHK pricing and provided contact details.',
                appointment_status: 'Site Visit Requested'
            }]);
        console.log('Demo data successfully seeded!');
    }
    catch (err) {
        console.error('Error seeding demo data:', err);
    }
}
