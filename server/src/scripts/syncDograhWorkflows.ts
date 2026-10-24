import dotenv from 'dotenv';
dotenv.config();

import { buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition, WORKFLOW_CONFIGURATIONS } from '../modules/phone-calls/workflowDefinition';
import { buildDograhPhoneInstruction, buildDograhOutboundInstruction, withoutAutoKnownPhoneField } from '../modules/phone-calls/receptionistInstruction';
import { updateWorkflowInPlace, publishWorkflow } from '../modules/phone-calls/dograhClient';

// Production bot: Lok8 Brookside
const botId = 'b148f573-bb2e-4fb9-882c-3ae31686ff5a';
const inboundWfId = '21';
const outboundWfId = '22';

const inboundToolUuids = [
  'f804b5af-6fb4-4c66-8bcc-13ad92548ca0', // Check availability
  'e26c1871-e1b2-4dc6-8016-86262f82333a', // Book appointment
];

const outboundToolUuids = [
  '6ca59722-9d81-4bf0-8496-244062e8acd9', // Call time remaining
  'f804b5af-6fb4-4c66-8bcc-13ad92548ca0', // Check availability
  'e26c1871-e1b2-4dc6-8016-86262f82333a', // Book appointment
];

const botObj = {
  id: botId,
  business_name: 'Lok8 Brookside',
  industry: 'Real Estate',
  phone_number: '+912264230099',
  knowledge_base: `PROJECT: Lok8 Brookside (दक्षिण नागपूर - Kharsoli-Wela Harichandra, उमरेड रोड व आऊटर रिंग रोड जवळ, समृद्धी महामार्ग व MIHAN जवळ).
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
* Use common English words naturally (plot, project, budget, square feet, investment, site visit, amenities, WhatsApp).
* Keep answers short (1-2 sentences). Always sound warm, polite, and helpful.
* Never invent prices or payment schemes not listed above. For exact cost sheets, offer to send via WhatsApp.

RECEPTIONIST FLOW:
1. GREETING (Turn 1): When the call connects, ONLY say:
"नमस्कार! Lok8 Brookside मध्ये आपलं स्वागत आहे. मी प्रिया बोलतेय, मी आपली काय मदत करू शकते?"
Do NOT say anything else in Turn 1. Wait for caller to speak.

2. ASK NAME (Turn 2): After caller responds:
Warmly acknowledge and ask for their name:
"नक्कीच! त्याआधी मी आपलं शुभनाव जाणून घेऊ शकते का?"
Wait for caller to provide their name.

3. ANSWER & INQUIRE: Once name is provided, address caller respectfully by name. Answer their questions about the project helpfully. Inquire what plot size they are looking for (1200, 1500, 2000 ते 5000 sq ft) and their planned budget: "आणि यासाठी तुमचं साधारण काय बजेट प्लॅन केलंय?".

4. PROACTIVE SITE VISIT BOOKING: Offer to book a site visit: "नक्कीच, हा प्रोजेक्ट प्रत्यक्ष अनुभवण्यासाठी एक साईट व्हिजिट नक्की प्लॅन करा. मी तुमच्यासाठी उद्या किंवा वीकेंडला एखादा स्लॉट बुक करू का?".
- Ask preferred date and time, check availability using check_availability, confirm slot with caller, then book with book_appointment.
- When calling book_appointment, pass caller ID ({{initial_context.caller_number}}) as visitorPhone, their budget as budget (e.g. "30 Lakh"), and plot size as requirement (e.g. "2000 sq ft plot").
- Title must be clean English: "Site Visit - [Caller Name]".
- NUMERALS RULE: Standard English numbers only (1200, 2000, 30 Lakh). NEVER Devanagari numerals.
- EMAIL RULE: NEVER invent fake emails (example.com). If caller didn't give an email, leave visitorEmail empty.

5. POLITE CLOSING: Ask: "याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?". Only after caller says no, conclude: "खूप खूप धन्यवाद, बाय, have a good day!". NEVER say "नमस्कार" at the end of the call.`,
};

const widgetConfig = {
  timezone: 'Asia/Kolkata',
  enableCalendar: true,
  requiredLeadFields: ['name', 'requirement', 'budget'] as Array<'name' | 'phone' | 'email' | 'requirement' | 'budget'>,
};

async function main() {
  console.log('1. Building new prompt instructions with natural conversational dates...');
  const extractionVariables = buildLeadExtractionVariables(withoutAutoKnownPhoneField(widgetConfig as any));
  const callbackUrl = 'https://test.ai-receptionist.agilewaters.com';
  const apiKey = process.env.PHONE_TOOLS_API_KEY || 'eef69d3ea083e8f4438869264ac4afacc4652005dba2e44f';

  const preCallFetchBase = `${callbackUrl}/api/phone-tools/${botId}/pre-call?key=${apiKey}`;
  const inboundPreCallFetchUrl = `${preCallFetchBase}&direction=inbound`;
  const outboundPreCallFetchUrl = `${preCallFetchBase}&direction=outbound`;

  // 1. Inbound Workflow
  console.log(`2. Updating Inbound Workflow ${inboundWfId} in Dograh...`);
  const inboundInstruction = buildDograhPhoneInstruction(botObj, widgetConfig as any, {
    timezone: 'Asia/Kolkata',
    useToolBasedBooking: true,
    openingInstruction: 'You are Priya, the polite and warm Virtual Receptionist answering inbound calls for Lok8 Brookside. Greet callers warmly, ask for their name, answer questions helpfully using project details, and guide them to schedule a site visit.',
  });

  const inboundDefinition = buildSingleNodeWorkflowDefinition({
    personaPrompt: inboundInstruction,
    extractionVariables,
    isOutbound: false,
    businessName: botObj.business_name,
    toolUuids: inboundToolUuids,
    preCallFetchUrl: inboundPreCallFetchUrl,
    useToolBasedBooking: true,
    customInboundPrompt: `START OF CALL - TURN 1 (Greeting):
Your very first utterance when the call connects MUST BE EXACTLY:
"नमस्कार! Lok8 Brookside मध्ये आपलं स्वागत आहे. मी प्रिया बोलतेय, मी आपली काय मदत करू शकते?"
Do NOT say anything else in Turn 1. Wait for caller to speak.

TURN 2 (Acknowledge & Ask Name):
After caller speaks or states what they are looking for:
Acknowledge them warmly and politely ask for their name:
"नक्कीच! त्याआधी मी आपलं शुभनाव जाणून घेऊ शकते का?"
Wait for caller to provide their name.

SUBSEQUENT CONVERSATION:
Follow the Receptionist Flow from the knowledge base:
- Address caller politely by name.
- Answer questions helpfully and concisely (1-2 sentences).
- Inquire about their desired plot size (1200, 1500, 2000 ते 5000 sq ft) and budget ("आणि यासाठी तुमचं साधारण काय बजेट प्लॅन केलंय?").
- Proactively offer a site visit and book it using check_availability and book_appointment.
- Never invent fake emails (leave visitorEmail empty if caller did not provide one).
- Always use standard English numbers (1200, 2000, 30 Lakh), never Devanagari numerals.`,
  });

  const updatedInbound = await updateWorkflowInPlace(inboundWfId, inboundDefinition, WORKFLOW_CONFIGURATIONS);
  console.log('Inbound workflow updated:', updatedInbound?.id || inboundWfId);
  await publishWorkflow(inboundWfId);
  console.log('Inbound workflow 21 published!');

  // Outbound workflow untouched as requested
  console.log('✅ Successfully updated Dograh Inbound Workflow 21!');
}

main().catch(err => {
  console.error('Failed to sync Dograh workflows:', err);
  process.exit(1);
});
