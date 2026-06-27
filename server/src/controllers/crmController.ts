import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../services/db';

async function loadOwnedBotId(botId: string, ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('bots')
    .select('id')
    .eq('id', botId)
    .eq('owner_id', ownerId)
    .single();

  if (error || !data) return null;
  return data.id;
}

export async function getStatus(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const ownedId = await loadOwnedBotId(botId, req.user!.id);
  if (!ownedId) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const { data } = await supabase
    .from('crm_connections')
    .select('id')
    .eq('bot_id', botId)
    .maybeSingle();

  res.json({ connected: Boolean(data) });
}

export async function connect(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const ownedId = await loadOwnedBotId(botId, req.user!.id);
  if (!ownedId) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const { webhookUrl, apiKey, signingSecret } = req.body || {};
  if (!webhookUrl || !apiKey) {
    res.status(400).json({ error: 'webhookUrl and apiKey are required' });
    return;
  }

  const { error } = await supabase.from('crm_connections').upsert(
    {
      bot_id: botId,
      owner_id: req.user!.id,
      webhook_url: webhookUrl,
      api_key: apiKey,
      signing_secret: signingSecret || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'bot_id' }
  );

  if (error) {
    res.status(500).json({ error: 'Failed to save CRM connection' });
    return;
  }

  res.json({ connected: true });
}

export async function disconnect(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const ownedId = await loadOwnedBotId(botId, req.user!.id);
  if (!ownedId) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  await supabase.from('crm_connections').delete().eq('bot_id', botId);
  res.json({ connected: false });
}
