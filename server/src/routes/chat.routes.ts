import { Router, Request, Response } from 'express';
import { handleChat } from '../controllers/chatController';
import { analyzeLead } from '../controllers/leadController';
import { supabase } from '../services/db';

const router = Router();

router.post('/reply', async (req: Request, res: Response): Promise<void> => {
  const { sessionId, userMessage } = req.body;

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
      sessionId
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

export default router;
