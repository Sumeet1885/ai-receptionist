import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../services/db';
import { testCrmConnection } from '../services/crmSync';

async function loadOwnedBot(botId: string, ownerId: string): Promise<{ id: string; business_name: string } | null> {
  const { data, error } = await supabase
    .from('bots')
    .select('id, business_name')
    .eq('id', botId)
    .eq('owner_id', ownerId)
    .single();

  if (error || !data) return null;
  return data;
}

function isValidWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function getStatus(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
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
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const webhookUrl = String(req.body?.webhookUrl || '').trim();
  const apiKey = String(req.body?.apiKey || '').trim();
  const signingSecret = String(req.body?.signingSecret || '').trim();
  if (!webhookUrl || !apiKey) {
    res.status(400).json({ error: 'webhookUrl and apiKey are required' });
    return;
  }
  if (!isValidWebhookUrl(webhookUrl)) {
    res.status(400).json({ error: 'webhookUrl must be a valid http(s) URL' });
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
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  await supabase.from('crm_connections').delete().eq('bot_id', botId);
  res.json({ connected: false });
}

export async function testConnection(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const bot = await loadOwnedBot(botId, req.user!.id);
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }

  const bodyWebhookUrl = String(req.body?.webhookUrl || '').trim();
  const bodyApiKey = String(req.body?.apiKey || '').trim();
  const bodySigningSecret = String(req.body?.signingSecret || '').trim();

  let connection: { webhook_url: string; api_key: string; signing_secret?: string | null };

  if (bodyWebhookUrl && bodyApiKey) {
    // Testing values the user just typed, before saving them.
    if (!isValidWebhookUrl(bodyWebhookUrl)) {
      res.status(400).json({ ok: false, message: 'webhookUrl must be a valid http(s) URL' });
      return;
    }
    connection = { webhook_url: bodyWebhookUrl, api_key: bodyApiKey, signing_secret: bodySigningSecret || null };
  } else {
    const { data } = await supabase
      .from('crm_connections')
      .select('webhook_url, api_key, signing_secret')
      .eq('bot_id', botId)
      .maybeSingle();

    if (!data) {
      res.status(400).json({ ok: false, message: 'No CRM connection found to test. Enter values above first.' });
      return;
    }
    connection = data;
  }

  const result = await testCrmConnection(connection, {
    sessionId: `test-${Date.now()}`,
    businessName: bot.business_name,
  });

  res.json(result);
}
