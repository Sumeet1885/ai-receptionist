import { Router, Request, Response } from 'express';
import { handleChat } from '../controllers/chatController';
import { analyzeLead } from '../controllers/leadController';
import { supabase } from '../services/db';
import { config } from '../config';
import { chatRateLimit } from '../middleware/rateLimit';
import { checkAllowedOrigin } from '../utils/security';
import { applyCorsOrigin } from '../utils/corsPolicy';
import { fetchRecentMessageHistory } from '../services/conversationHistory';
import { toPublicBotResponse } from '../services/publicBot';

const router = Router();

// JSON POSTs from customer sites are preflighted before their body is available.
// The preflight carries no protected data; each real request below still performs
// the bot-specific origin check before reading or mutating application data.
router.options(['/reply', '/session'], (req: Request, res: Response): void => {
  applyCorsOrigin(res, req.headers.origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Content-Type',
  );
  res.setHeader('Access-Control-Max-Age', '600');
  res.sendStatus(204);
});

router.use(chatRateLimit);

function checkCors(req: Request, res: Response, allowedDomains: string[] | undefined): boolean {
  const originCheck = checkAllowedOrigin(req, {
    allowedDomains: allowedDomains || [],
    extraAllowedOrigins: [config.clientUrl],
    allowRuntimeOrigin: true,
    requireSource: true,
  });

  if (!originCheck.allowed) {
    res.status(403).json({ error: originCheck.reason || 'Access Denied. Origin is not authorized.' });
    return false;
  }

  applyCorsOrigin(res, originCheck.sourceOrigin);

  return true;
}

router.post('/reply', async (req: Request, res: Response): Promise<void> => {
  const { sessionId, userMessage, timezone } = req.body;

  if (!sessionId || !userMessage) {
    res.status(400).json({ error: 'sessionId and userMessage are required' });
    return;
  }

  let botId: string | undefined;

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
    botId = session.bot_id;

    // 2. Fetch bot configuration
    const { data: bot, error: botErr } = await supabase
      .from('bots')
      .select('*')
      .eq('id', session.bot_id)
      .eq('is_active', true)
      .single();

    if (botErr || !bot) {
      res.status(404).json({ error: 'Bot not found' });
      return;
    }

    // CORS Check
    if (!checkCors(req, res, bot.allowed_domains)) return;

    // 3. Fetch last 20 messages (conversation history window)
    const history = await fetchRecentMessageHistory(supabase, sessionId);

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
    const requestId = req.headers['x-railway-request-id'] || req.headers['x-request-id'] || 'unknown';
    console.error('Express chat-reply error:', {
      requestId,
      sessionId,
      timezone,
      message: err?.message,
      stack: err?.stack
    });

    const safeReply =
      err?.message?.includes('No calendar connected')
        ? 'I can help with that, but the business calendar is not connected right now.'
        : err?.message?.includes('Gemini API error')
          ? 'I can help with that. Please share your name, and what you need, and I will try again.'
          : 'I ran into a temporary issue while processing that request. Please try again.';

    try {
      await supabase.from('messages').insert([
        { session_id: sessionId, sender: 'user', content: userMessage },
        { session_id: sessionId, sender: 'bot', content: safeReply }
      ]);
    } catch (persistErr) {
      console.error('Failed to persist chat fallback messages:', persistErr);
    }

    // The visitor's message was still captured even though Gemini failed -
    // don't let a transient AI error silently drop a lead.
    if (botId) {
      const transcript = `Visitor: ${userMessage}\nReceptionist: ${safeReply}`;
      analyzeLead({ sessionId, botId, transcript }, supabase)
        .catch(analysisErr => console.error('Background lead analysis error (fallback path):', analysisErr));
    }

    res.status(200).json({ reply: safeReply });
  }
});

// Public endpoint: get bot config for widget (no auth required)
router.get('/bot/:botId', async (req: Request, res: Response): Promise<void> => {
  const { botId } = req.params;
  try {
    const { data: bot, error } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .eq('is_active', true)
      .single();

    if (error || !bot) {
      res.status(404).json({ error: 'Bot not found or inactive' });
      return;
    }

    // CORS Check
    if (!checkCors(req, res, bot.allowed_domains)) return;

    res.json(toPublicBotResponse(bot));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint: resolve an active bot for the standalone hosted chat page.
router.get('/bot/subdomain/:subdomain', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: bot, error } = await supabase
      .from('bots')
      .select('*')
      .eq('subdomain', req.params.subdomain)
      .eq('is_active', true)
      .single();

    if (error || !bot) {
      res.status(404).json({ error: 'Bot not found or inactive' });
      return;
    }

    if (!checkCors(req, res, bot.allowed_domains)) return;
    res.json(toPublicBotResponse(bot));
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
      .eq('is_active', true)
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
