// @ts-nocheck
import { config } from '../config';
import { isCrmSyncEnabled, syncLeadToCrm } from '../services/crmSync';
import { logger } from '../services/cloudwatchLogger';
import { formatInTimezone, getTimezoneOffsetString, normalizeTimezone } from '../utils/date';

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
  /** Server-verified email from the web voice channel's contactCollection state machine
   * (request_text_input), when available. Takes priority over the LLM's transcript guess for the
   * same reason knownPhone does - it's the actual validated value, not a spoken/typed guess. */
  knownEmail?: string;
  knownName?: string;
  knownBudget?: string;
  knownRequirement?: string;
}

export interface LeadData {
  name: string;
  phone: string;
  email: string;
  requirement: string;
  budget: string;
  leadScore: 'HOT' | 'WARM' | 'COLD';
  sentiment: 'Positive' | 'Neutral' | 'Urgent/Demanding' | 'Angry';
  summary: string;
  appointmentStatus: string;
}

const SYSTEM_PROMPT = `You are an advanced business backend analyst. Analyze the conversation between a customer and an AI receptionist. Extract lead, budget, and requirement information and return valid JSON with these exact fields:
- name: First and last name if mentioned, otherwise empty string
- phone: Mobile or contact number if mentioned, otherwise empty string
- email: Email address if mentioned, otherwise empty string
- requirement: Customer's specific requirement, inquiry, product/service requested, or purpose
- budget: Financial capability or budget if mentioned (e.g. "$500", "25 Lakhs", "50L", "1 Crore", etc. Return "N/A" if not stated)
- leadScore: Must be one of "HOT", "WARM", or "COLD". Follow these strict rules:
  * "HOT": If the customer provides a budget AND shows interest in an appointment/visit/callback, OR if they agree to/schedule/confirm a meeting or visit slot, you MUST score them as "HOT".
  * "WARM": The customer engaged and discussed their requirements or inquiries, but did NOT commit to a meeting/visit and did NOT provide a budget.
  * "COLD": The customer did not reply, remained silent, hung up immediately, was unreachable, or explicitly declined. (If the customer did not respond, set summary to "Customer did not reply", sentiment to "No Response", and leadScore to "COLD").
- sentiment: One of "Positive", "Neutral", "No Response", "Urgent/Demanding", or "Angry" (If the customer did not respond, set to "No Response")
- summary: Brief 1-sentence recap of customer requirement, budget, and appointment/next steps status
- appointmentStatus: Any booked, scheduled, or agreed meeting/visit slot (e.g. "Saturday 11 AM", "Weekend", "Confirmed"), callback request, or "None"`;

export function parseAppointmentDateTime(statusText: string, transcriptText: string = ''): { hour: number; minute: number; targetDay: number } {
  // Helper to extract day of week (0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat)
  const extractDayOfWeek = (text: string): number | null => {
    const t = text.toLowerCase();
    if (/friday|शुक्रवार|शुक्रवारी|fri\b/.test(t)) return 5;
    if (/saturday|शनिवार|शनिवारी|sat\b/.test(t)) return 6;
    if (/sunday|रविवार|रविवारी|sun\b/.test(t)) return 0;
    if (/thursday|गुरुवार|गुरुवारी|thu\b/.test(t)) return 4;
    if (/wednesday|बुधवार|बुधवारी|wed\b/.test(t)) return 3;
    if (/tuesday|मंगळवार|मंगळवारी|tue\b/.test(t)) return 2;
    if (/monday|सोमवार|सोमवारी|mon\b/.test(t)) return 1;
    return null;
  };

  // Give strict priority to the structured appointment status (e.g. "Friday 10 AM")
  let targetDay = extractDayOfWeek(statusText);
  if (targetDay === null && transcriptText) {
    targetDay = extractDayOfWeek(transcriptText);
  }
  // Default to Saturday if no day was found
  if (targetDay === null) {
    targetDay = 6;
  }

  const combined = `${statusText} ${transcriptText}`.toLowerCase();

  // 2. Specific time patterns
  let hour = 11;
  let minute = 0;

  // Check for "सवाई बारह" / "सवा बारा" (12:15)
  if (/सवाई\s*बारह|सवा\s*बारा|12[:.]15/.test(combined)) {
    return { hour: 12, minute: 15, targetDay };
  }
  // Check for "साडे बारा" (12:30)
  if (/साडे\s*बारा|12[:.]30/.test(combined)) {
    return { hour: 12, minute: 30, targetDay };
  }

  // Regex for e.g. "12 PM", "11 AM", "4:00 PM", "12 बजे", "11 वाजता", "12 pm", "12:00"
  const timeMatch = combined.match(/\b(1[0-2]|[1-9])(?::([0-5][0-9]))?\s*(am|pm|बजे|वाजता)?\b/);
  if (timeMatch) {
    let rawHour = parseInt(timeMatch[1], 10);
    const rawMin = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3];

    if (meridian === 'pm' && rawHour < 12) {
      rawHour += 12;
    } else if (meridian === 'am' && rawHour === 12) {
      rawHour = 0;
    } else if (!meridian || meridian === 'बजे' || meridian === 'वाजता') {
      // If 1, 2, 3, 4, 5, 6 without AM/PM, it's typically afternoon (1 PM to 6 PM)
      if (rawHour >= 1 && rawHour <= 6) {
        rawHour += 12;
      }
    }
    hour = rawHour;
    minute = rawMin;
  } else if (/दुपार|afternoon/.test(combined)) {
    hour = 14; // 2 PM default afternoon
  } else if (/सकाळ|morning/.test(combined)) {
    hour = 11; // 11 AM default morning
  } else if (/संध्याकाळ|evening/.test(combined)) {
    hour = 17; // 5 PM default evening
  }

  return { hour, minute, targetDay };
}

/**
 * Sends the conversation transcript to Groq (llama-3.1-8b-instant) with JSON mode.
 * Receives structured lead data and upserts it into the leads table.
 * Falls back silently if Groq is not configured or the call fails.
 */
export async function analyzeLead(
  input: LeadInput,
  supabase: any
): Promise<void> {
  const { sessionId, botId, transcript, knownPhone, knownEmail, knownName, knownBudget, knownRequirement } = input;

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
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: analysisPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[leadController] Groq API returned status ${response.status}:`, errBody);
    } else {
      const data = await response.json();
      rawText = data.choices?.[0]?.message?.content;
    }
  } catch (err) {
    console.error('[leadController] Groq fetch error:', err);
  }

  let lead: LeadData;
  if (rawText) {
    try {
      lead = JSON.parse(rawText);
    } catch {
      lead = {
        name: '',
        phone: '',
        email: '',
        requirement: 'General inquiry',
        budget: 'N/A',
        leadScore: 'WARM',
        sentiment: 'Neutral',
        summary: 'Customer called and spoke with receptionist.',
        appointmentStatus: 'None'
      };
    }
  } else {
    lead = {
      name: '',
      phone: '',
      email: '',
      requirement: 'General inquiry',
      budget: 'N/A',
      leadScore: 'WARM',
      sentiment: 'Neutral',
      summary: 'Customer called and spoke with receptionist.',
      appointmentStatus: 'None'
    };
  }

  const phone = knownPhone?.trim() || lead.phone?.trim() || '';
  lead.phone = phone; // single source of truth for both the upsert below and syncLeadToCrm's payload
  const email = knownEmail?.trim() || lead.email?.trim() || '';
  lead.email = email; // same pattern as phone, for the same reason
  const name = lead.name?.trim() || knownName?.trim() || 'Anonymous';
  lead.name = name;

  if (knownBudget?.trim() && (!lead.budget || lead.budget === 'N/A' || /^(none|unknown|n\/a)$/i.test(lead.budget.trim()))) {
    lead.budget = knownBudget.trim();
  }
  if (knownRequirement?.trim() && (!lead.requirement || lead.requirement.toLowerCase() === 'general inquiry' || lead.requirement.toLowerCase() === 'not specified')) {
    lead.requirement = knownRequirement.trim();
  }

  // Check if an appointment was already confirmed for this session so we don't accidentally downgrade it
  const { data: existingLead } = await supabase
    .from('leads')
    .select('appointment_status, lead_score')
    .eq('session_id', sessionId)
    .maybeSingle();

  const finalAppointmentStatus = existingLead?.appointment_status === 'Confirmed'
    ? 'Confirmed'
    : (lead.appointmentStatus || 'None');

  const hasBudget = Boolean(
    lead.budget &&
    lead.budget !== 'N/A' &&
    !/^(none|not mentioned|not provided|unknown|n\/a)$/i.test(lead.budget.trim())
  );

  const showsVisitInterest = Boolean(
    (finalAppointmentStatus && finalAppointmentStatus !== 'None') ||
    /site visit|visit|weekend|saturday|sunday|friday|thursday|wednesday|tuesday|monday|शनिवार|रविवार|शुक्रवार|गुरुवार|बुधवार|मंगळवार|सोमवार|हो|बघायला|येईन|येतो|येणार|पाहण्यासाठी|सकाळ|दुपार/i.test(finalAppointmentStatus) ||
    /site visit|visit|weekend|saturday|sunday|friday|thursday|wednesday|tuesday|monday|शनिवार|रविवार|शुक्रवार|गुरुवार|बुधवार|मंगळवार|सोमवार|हो|बघायला|येईन|येतो|येणार|पाहण्यासाठी|सकाळ|दुपार/i.test(lead.appointmentStatus || '') ||
    /site visit|visit|बघायला|येईन|येतो|येणार|पाहण्यासाठी/i.test(lead.summary || '') ||
    /site visit|visit|बघायला|येईन|येतो|येणार|पाहण्यासाठी/i.test(transcript)
  );

  let finalLeadScore: 'HOT' | 'WARM' | 'COLD' = lead.leadScore || 'COLD';
  if (existingLead?.lead_score === 'HOT' || existingLead?.appointment_status === 'Confirmed' || finalAppointmentStatus === 'Confirmed') {
    finalLeadScore = 'HOT';
  } else if (hasBudget && showsVisitInterest) {
    finalLeadScore = 'HOT';
  } else if (showsVisitInterest && !/none/i.test(finalAppointmentStatus)) {
    finalLeadScore = 'HOT';
  } else if (hasBudget && lead.sentiment === 'Positive') {
    finalLeadScore = 'HOT';
  }

  let finalSentiment = lead.sentiment || 'Neutral';
  const isSilentOrNoReply = /customer did not reply|unreachable|no response|remained silent/i.test(lead.summary || '') || !transcript || transcript.trim().length === 0;
  if (isSilentOrNoReply) {
    finalSentiment = 'No Response';
  }

  let finalRequirement = lead.requirement?.trim();
  if (!finalRequirement || finalRequirement.toLowerCase() === 'general inquiry') {
    finalRequirement = isSilentOrNoReply ? 'Not specified (No response)' : 'General Inquiry';
  }

  // If the customer did not respond, remained silent, or was unreachable, and no appointment was confirmed,
  // do not pollute the active leads queue. The call will still be preserved in Call History (phone_calls).
  if (isSilentOrNoReply && finalAppointmentStatus === 'None' && finalLeadScore === 'COLD') {
    console.log(`[leadController] Skipping leads queue creation for silent/unresponsive session ${sessionId}. Preserved in Call History.`);
    return;
  }

  const leadPayload: Record<string, any> = {
    bot_id:             botId,
    session_id:         sessionId,
    name:               name,
    phone:              phone || 'Not Provided',
    email:              email || null,
    requirement:        finalRequirement,
    budget:             lead.budget || 'N/A',
    sentiment:          finalSentiment,
    lead_score:         finalLeadScore,
    summary:            lead.summary || '',
    appointment_status: finalAppointmentStatus,
    updated_at:         new Date().toISOString()
  };

  try {
    const { data: botOwner } = await supabase.from('bots').select('owner_id').eq('id', botId).maybeSingle();
    if (botOwner?.owner_id) {
      leadPayload.customer_id = botOwner.owner_id;
    }
  } catch {
    // Non-blocking
  }

  let { error: upsertErr } = await supabase.from('leads').upsert(leadPayload, { onConflict: 'session_id' });
  if (upsertErr && /customer_id/i.test(upsertErr.message)) {
    delete leadPayload.customer_id;
    await supabase.from('leads').upsert(leadPayload, { onConflict: 'session_id' });
  }

  // Auto-create confirmed appointment record if caller agreed to site visit
  if (
    finalAppointmentStatus === 'Confirmed' ||
    (showsVisitInterest && !/none/i.test(finalAppointmentStatus)) ||
    /confirm|site visit|saturday|sunday|friday|thursday|wednesday|tuesday|monday|शनिवार|रविवार|शुक्रवार|गुरुवार|बुधवार|मंगळवार|सोमवार/i.test(finalAppointmentStatus)
  ) {
    try {
      const { data: existingAppt } = await supabase
        .from('appointments')
        .select('id, visitor_name, visitor_phone, start_time, end_time, calendar_event_id, status')
        .eq('session_id', sessionId)
        .maybeSingle();

      let businessName = 'Business';
      let botTimezone = 'Asia/Kolkata';
      try {
        const { data: bRow } = await supabase.from('bots').select('business_name, widget_config').eq('id', botId).maybeSingle();
        if (bRow?.business_name) businessName = bRow.business_name;
        if (bRow?.widget_config?.timezone) botTimezone = bRow.widget_config.timezone;
      } catch {
        // fallback to Business / Asia/Kolkata
      }
      botTimezone = normalizeTimezone(botTimezone, 'Asia/Kolkata');

      const appointmentTitle = `${businessName} Appointment - ${name !== 'Anonymous' ? name : 'Lead'}`;

      // If an appointment was ALREADY booked via the calendar tools mid-call (or was confirmed earlier),
      // DO NOT overwrite its verified start_time/end_time with a transcript heuristic guess!
      if (existingAppt?.start_time && (existingAppt.calendar_event_id || existingAppt.status === 'confirmed')) {
        await supabase.from('appointments').update({
          visitor_name: name !== 'Anonymous' ? name : existingAppt.visitor_name,
          visitor_phone: phone || existingAppt.visitor_phone,
          status: 'confirmed',
        }).eq('id', existingAppt.id);
      } else {
        const { hour, minute, targetDay } = parseAppointmentDateTime(finalAppointmentStatus, transcript);

        // Compute the target date in the business timezone (not the server's UTC system timezone!)
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: botTimezone }));
        const currentDay = nowInTz.getDay();
        let daysUntilTarget = (targetDay - currentDay + 7) % 7;
        if (daysUntilTarget === 0) {
          if (nowInTz.getHours() > hour || (nowInTz.getHours() === hour && nowInTz.getMinutes() >= minute)) {
            daysUntilTarget = 7;
          }
        }
        const targetDate = new Date(nowInTz.getFullYear(), nowInTz.getMonth(), nowInTz.getDate() + daysUntilTarget);
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const hh = String(hour).padStart(2, '0');
        const min = String(minute).padStart(2, '0');

        const tzOffset = getTimezoneOffsetString(botTimezone, targetDate);
        const startTime = `${yyyy}-${mm}-${dd}T${hh}:${min}:00${tzOffset}`;
        const startDateTimeObj = new Date(startTime);
        const endDateTimeObj = new Date(startDateTimeObj.getTime() + 60 * 60 * 1000);
        const endTime = formatInTimezone(endDateTimeObj, botTimezone);

        if (!existingAppt) {
          await supabase.from('appointments').insert({
            bot_id: botId,
            session_id: sessionId,
            title: appointmentTitle,
            visitor_name: name !== 'Anonymous' ? name : 'Prospective Buyer',
            visitor_phone: phone || 'Not Provided',
            start_time: startTime,
            end_time: endTime,
            status: 'confirmed',
          });
        } else {
          await supabase.from('appointments').update({
            start_time: startTime,
            end_time: endTime,
            visitor_name: name !== 'Anonymous' ? name : existingAppt.visitor_name,
            visitor_phone: phone || existingAppt.visitor_phone,
            status: 'confirmed',
          }).eq('id', existingAppt.id);
        }
      }
    } catch (apptErr) {
      console.warn('[leadController] Failed to auto-create appointment for confirmed visit:', apptErr);
    }
  }

  logger.leadEvent('lead_analyzed', {
    botId,
    sessionId,
    leadScore: lead.leadScore || 'COLD',
    sentiment: lead.sentiment || 'Neutral',
    appointmentStatus: lead.appointmentStatus || 'None',
    requirement: lead.requirement || 'General Inquiry',
    hasName: Boolean(lead.name && lead.name !== 'Anonymous'),
    hasPhone: Boolean(phone && phone !== 'Not Provided'),
    hasEmail: Boolean(email),
    summary: lead.summary || '',
  });

  if (lead.leadScore === 'HOT') {
    logger.leadEvent('hot_lead_qualified', {
      botId,
      sessionId,
      requirement: lead.requirement,
      summary: lead.summary,
    });
  }

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
      logger.leadEvent('lead_crm_sync_dispatched', {
        botId,
        sessionId,
        businessName,
        leadScore: lead.leadScore,
      });
      syncLeadToCrm(lead, crmConn, { sessionId, businessName }).catch((err) =>
        console.error('[crm-sync] background sync error:', err)
      );
    }
  }
}
