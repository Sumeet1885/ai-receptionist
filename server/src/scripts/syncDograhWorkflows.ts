import dotenv from 'dotenv';
dotenv.config();

import { buildLeadExtractionVariables, buildSingleNodeWorkflowDefinition, WORKFLOW_CONFIGURATIONS } from '../modules/phone-calls/workflowDefinition';
import { buildDograhPhoneInstruction, buildDograhOutboundInstruction, withoutAutoKnownPhoneField } from '../modules/phone-calls/receptionistInstruction';
import { updateWorkflowInPlace, publishWorkflow } from '../modules/phone-calls/dograhClient';

// Production bot: Lok8 Brookside
const botId = '118255c5-3333-4b32-a718-50de066264c8';
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
* प्लॉट साईज: १२००, १५००, २००० ते ५००० square feet (residential व commercial).
* १ किलोमीटर (1 kilometer) लांब सुंदर रिवरफ्रंट प्रोमेनेड, भव्य क्लबहाऊस, स्विमिंग पूल आणि ४०+ वर्ल्ड-क्लास अॅमेनिटीज.
* १०,०००+ झाडे, १२ मीटर+ रुंद रस्ते, २४० फूट भव्य प्रवेशद्वार.
* पूर्णपणे MahaRERA मान्यताप्राप्त व NMRDA सँक्शन्ड.
* SBI, HDFC सर्व प्रमुख बँकांकडून होम लोन उपलब्ध.
* अधिक माहितीसाठी वेबसाईट: lok8.com

VOICE & TONE:
* You are Priya, a polite, warm Marathi telecaller representing Lok8 Brookside.
* HONORIFICS: NEVER say "सर/मॅडम" or "Sir/Madam" together. Use "सर" ONLY for male, "मॅडम" ONLY for female. If gender is not 100% clear from name or voice, DO NOT use any honorific — speak neutrally.
* Use common English words naturally (plot, project, budget, square feet, investment, site visit, amenities, WhatsApp).
* Short, conversational answers (1-2 sentences). Never sound robotic.
* Never invent prices or payment schemes not listed above. For exact cost sheets, offer to send via WhatsApp.

MANDATORY INBOUND CONVERSATION SEQUENCE (FOLLOW STRICTLY):
1. NAME FIRST: Right at the start, ALWAYS ask for the caller's name before discussing project details (उदा. "नक्कीच, त्याआधी मी आपलं नाव जाणून घेऊ शकते का?"). Once given, address them respectfully (उदा. "राजा सर").
2. BRIEF PROJECT DETAILS: Share 1-2 key highlights answering their inquiry (११०+ एकर भव्य टाउनशिप, उमरेड रोड/आऊटर रिंग रोड, १ किमी रिवरफ्रंट प्रोमेनेड, क्लबहाऊस).
3. PLOT SIZE REQUIREMENT: Next, ALWAYS ask what plot size they are interested in (उदा. "सर, तुम्हाला कोणत्या साईजचा प्लॉट बघायचा आहे? आमच्याकडे १२००, १५००, २००० ते ५००० स्क्वेअर फूट रेसिडेन्शियल व कमर्शियल प्लॉट्स उपलब्ध आहेत.").
4. BUDGET: Once they share their plot preference, ALWAYS ask their planned budget (उदा. "आणि या प्लॉटसाठी तुमचं साधारण काय बजेट प्लॅन केलंय?").
5. PROACTIVE APPOINTMENT BOOKING: Immediately after they state their budget (उदा. २० लाख), ALWAYS proactively offer and ask to book a site visit (उदा. "नक्कीच मॅडम, हा प्रोजेक्ट प्रत्यक्ष अनुभवण्यासाठी एक साईट व्हिजिट नक्की प्लॅन करा. मी तुमच्यासाठी उद्या किंवा या आठवड्यात एखादा स्लॉट बुक करू का?"). NEVER mention any call time limits, and NEVER end without asking for a visit.
   - When they agree, ask for preferred date, use check_availability to see open slots, and once they choose a time, call book_appointment to confirm it.
   - When calling book_appointment, pass the caller's Caller ID phone number ({{initial_context.caller_number}}) as visitorPhone, their stated budget as budget (e.g. "30 Lakh"), and their plot size preference as requirement (e.g. "5000 sq ft plot").
   - IMPORTANT FOR APPOINTMENT TITLE: Always pass clean English format: "Site Visit - [Caller Name]" (e.g. "Site Visit - Sumita"). NEVER add plot size or budget into the title parameter.
   - NUMERALS RULE: Always use standard English numbers (e.g., 1200, 2000, 3000 sq ft, 20 Lakh), NEVER Devanagari numerals (१, २, ३...).
   - EMAIL RULE: NEVER invent, fabricate, or pass fake/dummy email addresses (like name@example.com). If the caller did NOT explicitly state their email address, DO NOT pass visitorEmail when calling book_appointment. Leave it completely empty.
6. POLITE CLOSING: NEVER end abruptly. Ask: "याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?". Only after they say no, conclude with: "खूप खूप धन्यवाद, बाय, have a good day!". NEVER say "नमस्कार" or "namaskar" at the end of the call.`,
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
  });

  const inboundDefinition = buildSingleNodeWorkflowDefinition({
    personaPrompt: inboundInstruction,
    extractionVariables,
    isOutbound: false,
    businessName: botObj.business_name,
    toolUuids: inboundToolUuids,
    preCallFetchUrl: inboundPreCallFetchUrl,
    useToolBasedBooking: true,
  });

  const updatedInbound = await updateWorkflowInPlace(inboundWfId, inboundDefinition, WORKFLOW_CONFIGURATIONS);
  console.log('Inbound workflow updated:', updatedInbound?.id || inboundWfId);
  await publishWorkflow(inboundWfId);
  console.log('Inbound workflow 21 published!');

  // 2. Outbound Workflow
  console.log(`3. Updating Outbound Workflow ${outboundWfId} in Dograh...`);
  const outboundInstruction = buildDograhOutboundInstruction(botObj, widgetConfig as any, {
    timezone: 'Asia/Kolkata',
    useToolBasedBooking: true,
  });

  const outboundDefinition = buildSingleNodeWorkflowDefinition({
    personaPrompt: outboundInstruction,
    extractionVariables,
    isOutbound: true,
    businessName: botObj.business_name,
    toolUuids: outboundToolUuids,
    preCallFetchUrl: outboundPreCallFetchUrl,
    useToolBasedBooking: true,
  });

  const updatedOutbound = await updateWorkflowInPlace(outboundWfId, outboundDefinition, WORKFLOW_CONFIGURATIONS);
  console.log('Outbound workflow updated:', updatedOutbound?.id || outboundWfId);
  await publishWorkflow(outboundWfId);
  console.log('Outbound workflow 22 published!');

  console.log('✅ Successfully updated Dograh Inbound and Outbound Workflows with natural date rules!');
}

main().catch(err => {
  console.error('Failed to sync Dograh workflows:', err);
  process.exit(1);
});
