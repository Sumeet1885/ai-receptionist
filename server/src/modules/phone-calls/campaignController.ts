import { Response } from 'express';
import * as XLSX from 'xlsx';
import { AuthRequest } from '../../middleware/auth';
import { supabase } from '../../services/db';
import { startCampaign, stopCampaign, isCampaignRunning } from './campaignRunner';

// ── Column header detection ──────────────────────────────────────────────────

const PHONE_PATTERNS = ['phone', 'mobile', 'number', 'tel', 'telephone', 'contact number', 'ph', 'cell', 'contact'];
const NAME_PATTERNS = ['name', 'full name', 'contact', 'customer name', 'client', 'person'];

function detectColumn(headers: string[], patterns: string[]): string | null {
  for (const h of headers) {
    const lower = h.toLowerCase().trim();
    if (patterns.some(p => lower.includes(p))) return h;
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadOwnedCampaign(campaignId: string, ownerId: string) {
  const { data, error } = await supabase
    .from('call_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('owner_id', ownerId)
    .single();
  if (error || !data) return null;
  return data;
}

async function loadCampaignBot(campaignId: string, ownerId: string) {
  const campaign = await loadOwnedCampaign(campaignId, ownerId);
  if (!campaign) return null;

  const { data: bot } = await supabase
    .from('bots')
    .select('id, owner_id, business_name, industry, knowledge_base, dograh_workflow_id, dograh_outbound_workflow_id, dograh_telephony_config_id, dograh_phone_number_id, dograh_phone_number')
    .eq('id', campaign.bot_id)
    .eq('owner_id', ownerId)
    .single();

  return bot ? { campaign, bot } : null;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/bots/:botId/upload
 * Accepts multipart/form-data with fields:
 *   - file: the Excel file (.xlsx / .xls / .csv)
 *   - name: campaign name (optional, defaults to filename)
 *   - hourlyCap: optional integer override for this campaign's hourly call cap
 */
export async function uploadCampaign(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const ownerId = req.user!.id;

  // Verify bot ownership + outbound provisioning
  const { data: bot } = await supabase
    .from('bots')
    .select('id, owner_id, dograh_outbound_workflow_id, dograh_telephony_config_id, dograh_phone_number_id, business_name')
    .eq('id', botId)
    .eq('owner_id', ownerId)
    .single();

  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }
  if (!bot.dograh_outbound_workflow_id || !bot.dograh_telephony_config_id || !bot.dograh_phone_number_id) {
    res.status(400).json({ error: 'Provision the phone agent and assign a number before creating a campaign.' });
    return;
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded. Please attach an Excel or CSV file.' });
    return;
  }

  // Parse Excel
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
  } catch {
    res.status(400).json({ error: 'Could not read the uploaded file. Please upload a valid .xlsx, .xls, or .csv file.' });
    return;
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    res.status(400).json({ error: 'The uploaded file has no sheets.' });
    return;
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    res.status(400).json({ error: 'The uploaded sheet is empty.' });
    return;
  }

  const headers = Object.keys(rows[0]);
  const phoneCol = detectColumn(headers, PHONE_PATTERNS);
  const nameCol = detectColumn(headers, NAME_PATTERNS);

  if (!phoneCol) {
    res.status(400).json({
      error: `Could not find a phone number column. Make sure one column header contains "phone", "mobile", "number", "tel", or similar. Detected columns: ${headers.join(', ')}`,
    });
    return;
  }

  // Parse campaign metadata
  const campaignName = (req.body?.name as string)?.trim() || file.originalname.replace(/\.[^.]+$/, '') || 'Campaign';
  const hourlyCap = req.body?.hourlyCap ? Number(req.body.hourlyCap) : null;
  if (hourlyCap !== null && (!Number.isFinite(hourlyCap) || hourlyCap < 1 || hourlyCap > 500)) {
    res.status(400).json({ error: 'hourlyCap must be between 1 and 500.' });
    return;
  }

  // Create campaign row
  const { data: campaign, error: campaignErr } = await supabase
    .from('call_campaigns')
    .insert({
      bot_id: botId,
      owner_id: ownerId,
      name: campaignName,
      status: 'pending',
      total_contacts: rows.length,
      called_count: 0,
      hourly_cap_override: hourlyCap,
    })
    .select('id')
    .single();

  if (campaignErr || !campaign) {
    res.status(500).json({ error: 'Failed to create campaign.' });
    return;
  }

  // Build contact rows
  const contactRows = rows.map((row, index) => {
    const phoneRaw = String(row[phoneCol] ?? '').trim();
    // Remove common spreadsheet phone formatting
    const phone = phoneRaw.replace(/[\s\-().]/g, '');
    const name = nameCol ? String(row[nameCol] ?? '').trim() || null : null;

    // extra_data: everything except the phone and name columns
    const extra: Record<string, unknown> = {};
    for (const h of headers) {
      if (h === phoneCol || h === nameCol) continue;
      extra[h] = row[h];
    }

    return {
      campaign_id: campaign.id,
      bot_id: botId,
      phone_number: phone,
      name,
      extra_data: Object.keys(extra).length > 0 ? extra : null,
      call_status: 'pending',
      row_index: index,
    };
  });

  // Filter out rows with no phone number
  const validContacts = contactRows.filter(r => r.phone_number.length >= 7);
  const skipped = contactRows.length - validContacts.length;

  // Batch insert contacts (chunks of 500)
  const CHUNK = 500;
  for (let i = 0; i < validContacts.length; i += CHUNK) {
    const { error: insertErr } = await supabase
      .from('campaign_contacts')
      .insert(validContacts.slice(i, i + CHUNK));

    if (insertErr) {
      // Cleanup partial campaign
      await supabase.from('call_campaigns').delete().eq('id', campaign.id);
      res.status(500).json({ error: 'Failed to save contacts: ' + insertErr.message });
      return;
    }
  }

  // Update total_contacts to reflect validated count
  await supabase
    .from('call_campaigns')
    .update({ total_contacts: validContacts.length })
    .eq('id', campaign.id);

  // Return preview (first 5 rows)
  const preview = validContacts.slice(0, 5).map(c => ({
    name: c.name,
    phone_number: c.phone_number,
    extra_data: c.extra_data,
  }));

  res.json({
    campaignId: campaign.id,
    contactCount: validContacts.length,
    skipped,
    preview,
    detectedColumns: { phone: phoneCol, name: nameCol || null },
  });
}

/**
 * GET /api/campaigns/bots/:botId
 * Lists all campaigns for a bot, newest first.
 */
export async function listCampaigns(req: AuthRequest, res: Response): Promise<void> {
  const botId = req.params.botId;
  const ownerId = req.user!.id;

  const { data, error } = await supabase
    .from('call_campaigns')
    .select('id, name, status, total_contacts, called_count, hourly_cap_override, created_at, completed_at')
    .eq('bot_id', botId)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Annotate running status from in-memory runner
  const campaigns = (data || []).map(c => ({
    ...c,
    isRunningLocally: isCampaignRunning(c.id),
  }));

  res.json({ campaigns });
}

/**
 * GET /api/campaigns/:campaignId
 * Returns campaign details + all contacts (with their call results).
 */
export async function getCampaign(req: AuthRequest, res: Response): Promise<void> {
  const { campaignId } = req.params;
  const ownerId = req.user!.id;

  const campaign = await loadOwnedCampaign(campaignId, ownerId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const { data: contacts, error } = await supabase
    .from('campaign_contacts')
    .select('id, phone_number, name, extra_data, call_status, call_summary, lead_score, call_duration, error_message, called_at, row_index')
    .eq('campaign_id', campaignId)
    .order('row_index', { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    campaign: { ...campaign, isRunningLocally: isCampaignRunning(campaignId) },
    contacts: contacts || [],
  });
}

/**
 * POST /api/campaigns/:campaignId/start
 * Starts or resumes the campaign runner.
 */
export async function startCampaignRoute(req: AuthRequest, res: Response): Promise<void> {
  const { campaignId } = req.params;
  const ownerId = req.user!.id;

  const result = await loadCampaignBot(campaignId, ownerId);
  if (!result) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const { campaign, bot } = result;

  if (campaign.status === 'completed') {
    res.status(400).json({ error: 'Campaign is already completed.' });
    return;
  }
  if (campaign.status === 'running') {
    res.status(400).json({ error: 'Campaign is already running.' });
    return;
  }
  if (!bot.dograh_outbound_workflow_id || !bot.dograh_telephony_config_id || !bot.dograh_phone_number_id) {
    res.status(400).json({ error: 'Bot phone agent is not fully provisioned.' });
    return;
  }

  // Set status to running in DB
  const { error: updateErr } = await supabase
    .from('call_campaigns')
    .update({ status: 'running' })
    .eq('id', campaignId);

  if (updateErr) {
    res.status(500).json({ error: 'Failed to update campaign status.' });
    return;
  }

  // Start the in-memory loop
  startCampaign(campaignId, bot as any, campaign.hourly_cap_override ?? null, supabase);

  res.json({ success: true, status: 'running' });
}

/**
 * POST /api/campaigns/:campaignId/pause
 * Pauses the campaign runner (stops scheduling new calls).
 */
export async function pauseCampaignRoute(req: AuthRequest, res: Response): Promise<void> {
  const { campaignId } = req.params;
  const ownerId = req.user!.id;

  const campaign = await loadOwnedCampaign(campaignId, ownerId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  stopCampaign(campaignId);

  await supabase
    .from('call_campaigns')
    .update({ status: 'paused' })
    .eq('id', campaignId);

  res.json({ success: true, status: 'paused' });
}

/**
 * DELETE /api/campaigns/:campaignId
 * Stops the runner and deletes the campaign + all contacts.
 */
export async function deleteCampaignRoute(req: AuthRequest, res: Response): Promise<void> {
  const { campaignId } = req.params;
  const ownerId = req.user!.id;

  const campaign = await loadOwnedCampaign(campaignId, ownerId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  stopCampaign(campaignId);

  const { error } = await supabase
    .from('call_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true });
}

/**
 * GET /api/campaigns/:campaignId/export
 * Streams an Excel file with all campaign contacts + call summary data.
 */
export async function exportCampaign(req: AuthRequest, res: Response): Promise<void> {
  const { campaignId } = req.params;
  const ownerId = req.user!.id;

  const campaign = await loadOwnedCampaign(campaignId, ownerId);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const { data: contacts, error } = await supabase
    .from('campaign_contacts')
    .select('phone_number, name, extra_data, call_status, call_summary, lead_score, call_duration, error_message, called_at, row_index')
    .eq('campaign_id', campaignId)
    .order('row_index', { ascending: true });

  if (error || !contacts) {
    res.status(500).json({ error: error?.message || 'Failed to load contacts.' });
    return;
  }

  // Collect all unique extra_data keys for dynamic columns
  const extraKeys = new Set<string>();
  for (const c of contacts) {
    if (c.extra_data && typeof c.extra_data === 'object') {
      Object.keys(c.extra_data).forEach(k => extraKeys.add(k));
    }
  }

  // Build worksheet rows
  const wsRows = contacts.map((c, i) => {
    const base: Record<string, unknown> = {
      '#': i + 1,
      'Name': c.name ?? '',
      'Phone': c.phone_number,
      'Status': c.call_status,
      'Called At': c.called_at ? new Date(c.called_at).toLocaleString() : '',
      'Duration (s)': c.call_duration ?? '',
      'Lead Score': c.lead_score ?? '',
      'Call Summary': c.call_summary ?? '',
      'Error': c.error_message ?? '',
    };

    for (const key of extraKeys) {
      base[key] = (c.extra_data as Record<string, unknown>)?.[key] ?? '';
    }

    return base;
  });

  const ws = XLSX.utils.json_to_sheet(wsRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Campaign Summary');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_summary.xlsx"`);
  res.send(buffer);
}
