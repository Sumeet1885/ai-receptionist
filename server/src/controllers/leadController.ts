// @ts-nocheck
import { config } from '../config';
const GEMINI_API_KEY = config.geminiApiKey ?? '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

export interface LeadInput {
  sessionId: string;
  botId: string;
  transcript: string; // pre-formatted dialogue string
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

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name:              { type: 'STRING', description: 'First and last name if mentioned, otherwise empty.' },
    phone:             { type: 'STRING', description: 'Mobile or contact number if mentioned, otherwise empty.' },
    requirement:       { type: 'STRING', description: 'Specific course, property, treatment, or role they are looking for.' },
    budget:            { type: 'STRING', description: 'Financial capability or investment budget if mentioned.' },
    leadScore:         { type: 'STRING', enum: ['HOT', 'WARM', 'COLD'] },
    sentiment:         { type: 'STRING', enum: ['Positive', 'Neutral', 'Urgent/Demanding', 'Angry'] },
    summary:           { type: 'STRING', description: 'Brief 1-sentence recap of user goals and query status.' },
    appointmentStatus: { type: 'STRING', description: 'Any booked slot, callback request, or "None".' }
  },
  required: ['name', 'phone', 'requirement', 'budget', 'leadScore', 'sentiment', 'summary', 'appointmentStatus']
};

/**
 * Sends the conversation transcript to Gemini with a strict JSON schema.
 * Receives structured lead data and upserts it into the leads table.
 */
export async function analyzeLead(
  input: LeadInput,
  supabase: any
): Promise<void> {
  const { sessionId, botId, transcript } = input;

  // 1. Call Gemini with structured output schema
  const analysisPrompt = `Analyze the conversation between a website visitor and an AI receptionist. Extract lead and requirement information.\n\nCONVERSATION TRANSCRIPT:\n${transcript}`;

  const geminiResponse = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: analysisPrompt }] }],
      systemInstruction: {
        parts: [{ text: 'You are an advanced business backend analyst. Evaluate the conversation and return valid JSON conforming strictly to the requested schema.' }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA
      }
    })
  });

  if (!geminiResponse.ok) return; // fail silently — analysis is non-blocking

  const geminiData = await geminiResponse.json();
  const rawText: string | undefined =
    geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) return;

  let lead: LeadData;
  try {
    lead = JSON.parse(rawText);
  } catch {
    return; // invalid JSON, skip
  }

  // 2. Upsert into leads table (keyed on session_id)
  await supabase.from('leads').upsert({
    bot_id:             botId,
    session_id:         sessionId,
    name:               lead.name || 'Anonymous',
    phone:              lead.phone || 'Not Provided',
    requirement:        lead.requirement || 'General Inquiry',
    budget:             lead.budget || 'N/A',
    sentiment:          lead.sentiment || 'Neutral',
    lead_score:         lead.leadScore || 'COLD',
    summary:            lead.summary || '',
    appointment_status: lead.appointmentStatus || 'None',
    updated_at:         new Date().toISOString()
  }, { onConflict: 'session_id' });
}
