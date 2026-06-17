import { Router, Request, Response } from 'express';
import { handleChat } from '../controllers/chatController';
import { analyzeLead } from '../controllers/leadController';
import { supabase } from '../services/db';

const router = Router();

// Helper to check CORS dynamically
function getHostname(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme).hostname.toLowerCase();
}

function checkCors(req: Request, res: Response, allowedDomains: string[] | undefined): boolean {
  if (!allowedDomains || allowedDomains.length === 0) {
    res.status(403).json({ error: 'Widget is disabled. No allowed domains configured.' });
    return false;
  }
  
  const origin = req.get('Referer') || req.get('Origin');
  if (!origin) {
    res.status(403).json({ error: 'Access Denied (Missing Origin)' });
    return false;
  }
  
  const originUrl = new URL(origin);
  const originHostname = originUrl.hostname.toLowerCase();
  const isAllowed = allowedDomains.some((domain) => {
    try { return getHostname(domain) === originHostname; } catch { return false; }
  });
  
  if (!isAllowed) {
    res.status(403).json({ error: `Access Denied. Origin ${originUrl.origin} is not authorized.` });
    return false;
  }
  return true;
}

router.post('/reply', async (req: Request, res: Response): Promise<void> => {
  const { sessionId, userMessage, timezone } = req.body;

  if (!sessionId || !userMessage) {
    res.status(400).json({ error: 'sessionId and userMessage are required' });
    return;
  }

  try {
    // 1. Resolve session -> get bot_id
    const { data: session, error: sessionErr } = await supabase
      .from('chat_sessions')
      .select('bot_id')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // 2. Fetch bot configuration
    const { data: bot, error: botErr } = await supabase
      .from('bots')
      .select('*')
      .eq('id', session.bot_id)
      .single();

    if (botErr || !bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    // CORS Check
    if (!checkCors(req, res, bot.allowed_domains)) return;

    // 3. Fetch last 20 messages (conversation history window)
    const { data: messages } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(20);

    const history = (messages ?? []).map((m: any) => ({
      id: m.created_at,
      sender: m.sender,
      text: m.content,
      timestamp: m.created_at
    }));

    // 4. Call chat controller (builds prompt, calls Gemini)
    const { reply } = await handleChat({
      bot,
      history,
      userMessage,
      sessionId,
      timezone
    }, supabase);

    // 5. Persist user message + bot reply to messages table
    await supabase.from('messages').insert([
      { session_id: sessionId, sender: 'user', content: userMessage },
      { session_id: sessionId, sender: 'bot', content: reply }
    ]);

    // 6. Fire lead analysis in background (non-blocking)
    const transcript = [...history, { sender: 'user', text: userMessage }, { sender: 'bot', text: reply }]
      .map(m => `${m.sender === 'user' ? 'Visitor' : 'Receptionist'}: ${m.text}`)
      .join('\n');

    // Run lead analysis in background asynchronously
    analyzeLead({ sessionId, botId: session.bot_id, transcript }, supabase)
      .catch(err => console.error('Background lead analysis error:', err));

    // 7. Return reply to browser
    res.json({ reply });

  } catch (err: any) {
    console.error('Express chat-reply error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Public endpoint: get bot config for widget (no auth required)
router.get('/bot/:botId', async (req: Request, res: Response): Promise<void> => {
  const { botId } = req.params;
  try {
    const { data: bot, error } = await supabase
      .from('bots')
      .select('id, business_name, greeting, primary_color, languages, industry, allowed_domains')
      .eq('id', botId)
      .eq('is_active', true)
      .single();

    if (error || !bot) {
      res.status(404).json({ error: 'Bot not found or inactive' });
      return;
    }

    // CORS Check
    if (!checkCors(req, res, bot.allowed_domains)) return;

    res.json(bot);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint: create a chat session for widget (no auth required)
router.post('/session', async (req: Request, res: Response): Promise<void> => {
  const { botId, visitorId } = req.body;
  if (!botId) {
    res.status(400).json({ error: 'botId is required' });
    return;
  }

  try {
    // Get the bot to check CORS and fetch greeting
    const { data: bot, error: botErr } = await supabase
      .from('bots')
      .select('greeting, allowed_domains')
      .eq('id', botId)
      .single();

    if (botErr || !bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    // CORS Check
    if (!checkCors(req, res, bot.allowed_domains)) return;

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert([{ bot_id: botId, visitor_id: visitorId || `widget-${Date.now()}` }])
      .select('id')
      .single();

    if (error || !data) {
      res.status(500).json({ error: 'Failed to create session' });
      return;
    }

    if (bot.greeting) {
      await supabase.from('messages').insert([{
        session_id: data.id,
        sender: 'bot',
        content: bot.greeting
      }]);
    }

    res.json({ sessionId: data.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
