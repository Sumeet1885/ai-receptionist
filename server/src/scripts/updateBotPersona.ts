import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

import { config } from '../config';
import { mergeWidgetConfig } from '../utils/widgetConfig';
import { buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition, WORKFLOW_CONFIGURATIONS } from '../modules/phone-calls/workflowDefinition';
import { buildDograhPhoneInstruction, buildDograhOutboundInstruction, withoutAutoKnownPhoneField } from '../modules/phone-calls/receptionistInstruction';
import {
  updateWorkflowInPlace,
  publishWorkflow,
  updateHttpTool,
} from '../modules/phone-calls/dograhClient';

const botId = 'b148f573-bb2e-4fb9-882c-3ae31686ff5a';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function isCalendarConnected(ownerId: string): Promise<boolean> {
  const { data } = await supabase
    .from('calendar_connections')
    .select('id')
    .eq('owner_id', ownerId)
    .maybeSingle();
  return Boolean(data);
}

const newKnowledgeBase = `PROJECT: Lok8 Brookside (दक्षिण नागपूर - Kharsoli-Wela Harichandra, उमरेड रोड व आऊटर रिंग रोड जवळ, समृद्धी महामार्ग व MIHAN जवळ).
PROJECT HIGHLIGHTS:
* ११०+ एकर भव्य टाउनशिप, १००३ प्लॉट्स.
* प्लॉट साईज: १२००, १५००, २००० ते ५००० square feet.
* १ किलोमीटर (1 kilometer) लांब सुंदर रिवरफ्रंट प्रोमेनेड, भव्य क्लबहाऊस, स्विमिंग पूल आणि ४०+ वर्ल्ड-क्लास अॅमेनिटीज.
* १०,०००+ झाडे, १२ मीटर+ रुंद रस्ते, २४० फूट भव्य प्रवेशद्वार.
* पूर्णपणे MahaRERA मान्यताप्राप्त व NMRDA सँक्शन्ड.
* SBI, HDFC सर्व प्रमुख बँकांकडून होम लोन उपलब्ध.
* अधिक माहितीसाठी वेबसाईट: lok8.com

VOICE & TONE:
* You are Priya, the polite, warm Virtual AI Receptionist answering incoming phone calls for Lok8 Brookside. The customer has called YOU.
* HONORIFICS: NEVER say "सर/मॅडम" or "Sir/Madam" together. Use "सर" ONLY for male, "मॅडम" ONLY for female. If gender is not 100% clear from name or voice, speak neutrally without honorifics.
* BUDGET: When caller discusses plot requirements or sizes, ALWAYS ask their planned budget: "आणि तुमचं साधारण काय बजेट प्लॅन केलंय?".
* CLOSING: NEVER end the call or say goodbye abruptly. You MUST always ask first: "याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?". Only after the caller says no, conclude with: "खूप खूप धन्यवाद, बाय, have a good day!". NEVER say "नमस्कार" at the end of the call.
* Use common English words naturally (plot, project, budget, square feet, investment, site visit, amenities, WhatsApp).
* Short, conversational answers (1-2 sentences). Never sound robotic.
* Never invent prices or payment schemes not listed above. For exact cost sheets, offer to send via WhatsApp.`;

async function main() {
  console.log('1. Fetching bot...');
  const { data: bot, error: fetchErr } = await supabase.from('bots').select('*').eq('id', botId).single();
  if (fetchErr || !bot) throw fetchErr || new Error('Bot not found');

  console.log('2. Updating knowledge base & lead fields in Supabase...');
  const updatedWidgetConfig = {
    ...bot.widget_config,
    enableCalendar: true,
    requiredLeadFields: ['name', 'requirement', 'budget'],
  };

  const { error: updateErr } = await supabase.from('bots').update({
    knowledge_base: newKnowledgeBase,
    widget_config: updatedWidgetConfig,
  }).eq('id', botId);
  if (updateErr) throw updateErr;
  console.log('Bot successfully updated in Supabase!');

  // Refresh bot object
  bot.knowledge_base = newKnowledgeBase;
  bot.widget_config = updatedWidgetConfig;

  const widgetConfig = mergeWidgetConfig(updatedWidgetConfig, bot);
  const extractionVariables = buildLeadExtractionVariables(withoutAutoKnownPhoneField(widgetConfig));
  const callbackUrl = (config.phoneTools.callbackBaseUrl || '').trim();
  let isCallbackLive = false;
  if (callbackUrl && !callbackUrl.includes('localhost') && !callbackUrl.includes('host.docker.internal')) {
    try {
      const ping = await fetch(callbackUrl, { signal: AbortSignal.timeout(3000) });
      if (ping.status < 500 && ping.status !== 404) {
        isCallbackLive = true;
      }
    } catch {
      isCallbackLive = false;
    }
  }
  console.log(`Callback URL (${callbackUrl}): ${isCallbackLive ? 'LIVE' : 'UNREACHABLE / INACTIVE (Disabling pre-call block & dead tools to prevent call silence)'}`);

  if (isCallbackLive) {
    console.log('Updating tool callback URLs in Dograh...');
    if (bot.dograh_call_time_tool_uuid) {
      await updateHttpTool(bot.dograh_call_time_tool_uuid, {
        name: `Check Call Time Remaining - ${bot.business_name}`,
        description: 'Check how much time is left on this call before it should wrap up. Call this periodically, more often as the call goes on, to know when to start closing the conversation.',
        url: `${callbackUrl}/api/phone-tools/${bot.id}/call-time-remaining`,
        method: 'POST',
        headers: { 'X-API-Key': config.phoneTools.apiKey },
      }).catch(e => console.warn('Could not update call time tool:', e.message));
    }
    if (bot.dograh_check_availability_tool_uuid) {
      await updateHttpTool(bot.dograh_check_availability_tool_uuid, {
        name: `Check Availability - ${bot.business_name}`,
        description: 'Check available appointment slots for a given date. Returns start and end times of free slots.',
        url: `${callbackUrl}/api/phone-tools/${bot.id}/check-availability`,
        method: 'POST',
        headers: { 'X-API-Key': config.phoneTools.apiKey },
        parameters: [
          { name: 'date', type: 'string', description: 'Date in YYYY-MM-DD format', required: true },
        ],
      }).catch(e => console.warn('Could not update check availability tool:', e.message));
    }
    if (bot.dograh_book_appointment_tool_uuid) {
      await updateHttpTool(bot.dograh_book_appointment_tool_uuid, {
        name: `Book Appointment - ${bot.business_name}`,
        description: 'Book an appointment slot. Ensure availability was checked first and the caller has agreed to the specific slot.',
        url: `${callbackUrl}/api/phone-tools/${bot.id}/book-appointment`,
        method: 'POST',
        headers: { 'X-API-Key': config.phoneTools.apiKey },
        parameters: [
          { name: 'title', type: 'string', description: 'Title of the appointment (optional)', required: false },
          { name: 'visitorName', type: 'string', description: 'Caller full name', required: false },
          { name: 'visitorPhone', type: 'string', description: 'Caller phone number', required: false },
          { name: 'visitorEmail', type: 'string', description: 'Caller email address', required: false },
          { name: 'startTime', type: 'string', description: 'Start time in ISO 8601 format (e.g. 2026-10-06T15:00:00+05:30)', required: true },
          { name: 'endTime', type: 'string', description: 'End time in ISO 8601 format (optional, defaults to 30 min duration)', required: false },
        ],
      }).catch(e => console.warn('Could not update book appointment tool:', e.message));
    }
  }

  const preCallFetchBase = isCallbackLive ? `${callbackUrl}/api/phone-tools/${botId}/pre-call?key=${config.phoneTools.apiKey}` : '';
  const outboundPreCallFetchUrl = isCallbackLive ? `${preCallFetchBase}&direction=outbound` : '';
  const inboundPreCallFetchUrl = isCallbackLive ? `${preCallFetchBase}&direction=inbound` : '';

  const useTools = isCallbackLive && widgetConfig.enableCalendar && (await isCalendarConnected(bot.owner_id));
  console.log('Use tools (calendar booking):', useTools);

  const toolUuids = isCallbackLive
    ? [bot.dograh_call_time_tool_uuid, bot.dograh_check_availability_tool_uuid, bot.dograh_book_appointment_tool_uuid].filter(Boolean)
    : [];

  // Outbound Workflow
  console.log('3. Updating & publishing Outbound workflow (ID:', bot.dograh_outbound_workflow_id, ')...');
  const outboundInstruction = buildDograhOutboundInstruction(bot, widgetConfig, { timezone: 'Asia/Kolkata', useToolBasedBooking: useTools });
  const outboundDefinition = buildSingleNodeWorkflowDefinition({
    personaPrompt: outboundInstruction,
    extractionVariables,
    isOutbound: true,
    businessName: bot.business_name,
    toolUuids,
    preCallFetchUrl: outboundPreCallFetchUrl,
    customOutboundPrompt: widgetConfig.outboundPromptTemplate,
    useToolBasedBooking: useTools,
  });

  const outboundWorkflow = await updateWorkflowInPlace(bot.dograh_outbound_workflow_id, outboundDefinition, WORKFLOW_CONFIGURATIONS);
  await publishWorkflow(outboundWorkflow.id);
  console.log('Outbound workflow published! ID:', outboundWorkflow.id);

  // Inbound Workflow
  console.log('4. Updating & publishing Inbound workflow (ID:', bot.dograh_workflow_id, ')...');
  const inboundInstruction = buildDograhPhoneInstruction(bot, widgetConfig, { timezone: 'Asia/Kolkata', useToolBasedBooking: useTools });
  const inboundDefinition = buildSingleNodeWorkflowDefinition({
    personaPrompt: inboundInstruction,
    extractionVariables,
    isOutbound: false,
    businessName: bot.business_name,
    toolUuids,
    preCallFetchUrl: inboundPreCallFetchUrl,
    customInboundPrompt: widgetConfig.inboundPromptTemplate,
    useToolBasedBooking: useTools,
  });

  const inboundWorkflow = await updateWorkflowInPlace(bot.dograh_workflow_id, inboundDefinition, WORKFLOW_CONFIGURATIONS);
  await publishWorkflow(inboundWorkflow.id);
  console.log('Inbound workflow published! ID:', inboundWorkflow.id);

  console.log('All changes deployed to Dograh and Supabase successfully!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
