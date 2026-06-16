import { supabase } from '../lib/supabaseClient';

/**
 * Seeds initial demo data for a newly registered user so their dashboard isn't empty.
 */
export async function seedDemoDataForUser(userId: string) {
  try {
    // 1. Check if the user already has bots
    const { data: existingBots, error: botCheckError } = await supabase
      .from('bots')
      .select('id')
      .eq('owner_id', userId);

    if (botCheckError) throw botCheckError;
    if (existingBots && existingBots.length > 0) {
      console.log('User already has bots, skipping seeding.');
      return;
    }

    // 2. Create a default Demo Bot
    const demoBot = {
      owner_id: userId,
      business_name: 'PixelCraft Web Solutions',
      industry: 'Web Development',
      subdomain: `pixelcraft-${Math.floor(Math.random() * 10000)}`,
      greeting: 'Welcome to PixelCraft Web Solutions! 💻 How can I help you with custom web development, e-commerce stores, UI/UX design, or SEO services today?',
      primary_color: 'indigo',
      languages: ['English'],
      knowledge_base: `Company Overview

PixelCraft Web Solutions is a full-service web development company specializing in custom websites, e-commerce stores, web applications, UI/UX design, SEO, and digital marketing.

Business Hours:
Monday–Saturday: 9:00 AM – 7:00 PM IST

Services:
Business Websites, E-commerce Development, WordPress Development, Shopify Development, Custom Web Applications, Landing Pages, Website Redesign, SEO Services, Website Maintenance

Project Timelines:
Landing Page: 3–7 Days
Business Website: 7–21 Days
E-commerce Website: 15–45 Days
Custom Web Application: 30–120 Days

Pricing Guidelines:
Starter Website: ₹20,000+
Business Website: ₹35,000+
E-commerce Website: ₹60,000+
Custom Web Application: ₹1,50,000+
These are just ideal prices, if user asks for discounts, tell to speak from the developer directly.

Lead Collection Process:
Ask business type
Ask website requirements
Ask budget range
Collect name, email, and phone number
Offer free consultation call

Rules:
Never guarantee Google rankings.
Never provide final quotations without requirement analysis.
Always collect contact information before scheduling a consultation.
Escalate enterprise or custom software inquiries to the sales team.
Office Hours:
Monday–Saturday: 9:00 AM – 7:00 PM IST

Consultation:
Free Initial Consultation (30 Minutes)

Support Response Time:
Within 2 Business Hours

Service Areas:
India, UAE, UK, USA, Australia, Canada

Lead Qualification Questions:
What type of website do you need?
What is your business industry?
Do you already have a website?
What is your estimated budget?
When would you like the project completed?

Priority Lead Conditions:
Budget above ₹1,00,000
Urgent project requirements
Enterprise solutions
SaaS or custom software development requests`
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
  } catch (err) {
    console.error('Error seeding demo data:', err);
  }
}
