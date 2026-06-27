// @ts-nocheck
import { config } from '../config';
import { isCrmSyncEnabled, syncLeadToCrm } from '../services/crmSync';

const GROQ_API_KEY = config.groqApiKey || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface LeadInput {
  sessionId: string;
  botId: string;
  transcript: string;
  /** Phone number already known from telephony metadata (Dograh phone calls only - caller ID on
   * inbound, the dialed number on outbound). Takes priority over whatever the LLM extracts from
   * the transcript, since phone-call personas no longer ask the caller to read their number back
   * (it's redundant - see withoutAutoKnownPhoneField in receptionistInstruction.ts) and the LLM
   * would otherwise never see a phone number to extract. */
  knownPhone?: string;
}

export interface LeadData {
  name: string;
  phone: string;
  requirement: string;
  budget: string;
  leadScore: 'HOT' | 'WARM' | 'COLD';
  sentiment: 'Positive' | 'Neutral' | 'Urgent/Demanding' | 'Angry';
  summary: string;
  appointmentStatus: string;
}

const SYSTEM_PROMPT = `You are an advanced business backend analyst. Analyze the conversation between a website visitor and an AI receptionist. Extract lead and requirement information and return valid JSON with these exact fields:
- name: First and last name if mentioned, otherwise empty string
- phone: Mobile or contact number if mentioned, otherwise empty string
- requirement: Specific course, property, treatment, or role they are looking for
- budget: Financial capability or investment budget if mentioned
- leadScore: One of "HOT", "WARM", or "COLD"
- sentiment: One of "Positive", "Neutral", "Urgent/Demanding", or "Angry"
- summary: Brief 1-sentence recap of user goals and query status
- appointmentStatus: Any booked slot, callback request, or "None"`;

/**
 * Sends the conversation transcript to Groq (llama-3.1-8b-instant) with JSON mode.
 * Receives structured lead data and upserts it into the leads table.
 * Falls back silently if Groq is not configured or the call fails.
 */
export async function analyzeLead(
  input: LeadInput,
  supabase: any
): Promise<void> {
  const { sessionId, botId, transcript, knownPhone } = input;

  if (!GROQ_API_KEY) return;

  const analysisPrompt = `Analyze the conversation between a website visitor and an AI receptionist. Extract lead and requirement information.\n\nCONVERSATION TRANSCRIPT:\n${transcript}`;

  let rawText: string | undefined;

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: analysisPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) return;

    const data = await response.json();
    rawText = data.choices?.[0]?.message?.content;
  } catch {
    return;
  }

  if (!rawText) return;

  let lead: LeadData;
  try {
    lead = JSON.parse(rawText);
  } catch {
    return;
  }

  const phone = knownPhone?.trim() || lead.phone?.trim() || '';
  lead.phone = phone; // single source of truth for both the upsert below and syncLeadToCrm's payload

  await supabase.from('leads').upsert({
    bot_id:             botId,
    session_id:         sessionId,
    name:               lead.name || 'Anonymous',
    phone:              phone || 'Not Provided',
    requirement:        lead.requirement || 'General Inquiry',
    budget:             lead.budget || 'N/A',
    sentiment:          lead.sentiment || 'Neutral',
    lead_score:         lead.leadScore || 'COLD',
    summary:            lead.summary || '',
    appointment_status: lead.appointmentStatus || 'None',
    updated_at:         new Date().toISOString()
  }, { onConflict: 'session_id' });

  // Only mirror leads with at least a name and phone (this app's compulsory
  // contact fields) to the owner's own CRM, if they've connected one for this bot.
  if (lead.name?.trim() && phone) {
    const { data: crmConn } = await supabase
      .from('crm_connections')
      .select('webhook_url, api_key, signing_secret, bots(business_name)')
      .eq('bot_id', botId)
      .maybeSingle();

    if (isCrmSyncEnabled(crmConn)) {
      const businessName = Array.isArray(crmConn.bots) ? crmConn.bots[0]?.business_name : crmConn.bots?.business_name;
      syncLeadToCrm(lead, crmConn, { sessionId, businessName }).catch((err) =>
        console.error('[crm-sync] background sync error:', err)
      );
    }
  }
}
