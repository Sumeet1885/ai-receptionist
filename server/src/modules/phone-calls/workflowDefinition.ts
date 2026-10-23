import { WidgetConfig } from '../../utils/widgetConfig';

/**
 * Dograh's runtime is a graph the LLM re-evaluates every turn — there's no single-continuous-
 * session mode like Gemini Live. The smallest graph that still has a clean exit point is:
 * one global persona node (never traversed, just prepended) + one node that runs the entire
 * conversation + one node that says goodbye. No agentNode, no multi-step routing — the model
 * only ever has to make ONE forced choice per turn (keep talking vs. end the call), which is
 * the choice small/literal models (e.g. Groq llama-3.1-8b-instant) were misfiring on when the
 * AI-generated graph gave them a vaguer "Main Agenda -> End call" edge plus no persistent state.
 */

export interface ExtractionVariable {
  name: string;
  type: 'string' | 'number' | 'boolean';
  prompt: string;
}

const EXTRACTION_FIELD_SPECS: Record<string, { name: string; prompt: string }> = {
  name: { name: 'caller_name', prompt: "The caller's full name, if mentioned." },
  phone: { name: 'caller_phone', prompt: "The caller's contact phone number, if mentioned." },
  email: { name: 'caller_email', prompt: "The caller's email address, if mentioned." },
  requirement: { name: 'caller_requirement', prompt: 'What the caller is interested in or the purpose of their call.' },
  budget: { name: 'caller_budget', prompt: 'Budget or financial capacity mentioned by the caller, if any.' },
};

export function buildLeadExtractionVariables(widgetConfig: WidgetConfig): ExtractionVariable[] {
  return (widgetConfig.requiredLeadFields || [])
    .map(field => EXTRACTION_FIELD_SPECS[field])
    .filter(Boolean)
    .map(spec => ({ name: spec.name, type: 'string' as const, prompt: spec.prompt }));
}

// Dograh's own pipeline (run_pipeline.py) hard-aborts the call once elapsed time exceeds this -
// a silent CancelFrame with no goodbye, so this is a backstop, not the primary UX. It's set
// ~30s above phoneToolsController.ts' SOFT_LIMIT_SECONDS (270s/4:30) specifically so a graceful
// goodbye - driven by the get_call_time_remaining tool plus the persona prompt below - has room
// to land before this silent abort would ever need to fire under normal operation. Dograh
// exposes no mid-call timer/warning hook of its own (confirmed by reading
// pipeline_engine_callbacks_processor.py - it only supports this single abort threshold, no
// separate warning callback), which is why the warning is implemented as a tool call instead.
export const MAX_CALL_DURATION_SECONDS = 330;
export const WORKFLOW_CONFIGURATIONS = { max_call_duration: MAX_CALL_DURATION_SECONDS };

export interface SingleNodeWorkflowOptions {
  /** Full persona text (buildDograhPhoneInstruction/buildDograhOutboundInstruction output),
   * placed verbatim on the global node and prepended to the conversation node at runtime. */
  personaPrompt: string;
  extractionVariables: ExtractionVariable[];
  isOutbound: boolean;
  businessName: string;
  /** Tool UUIDs (dograhClient.createOrUpdateHttpTool) attached to the conversation node. Always
   * includes get_call_time_remaining; check_availability/book_appointment are appended only
   * when the bot's owner has a calendar connected (see dograhController.ts). */
  toolUuids: string[];
  /** Fetched once before the call connects and merged into initial_context - creates the
   * chat_sessions row up front so every tool call during the call (including the time check)
   * and the post-call mirror (callMirror.ts) bind to the same session instead of racing. Always
   * set now, not just when calendar tools are attached. */
  preCallFetchUrl: string;
  useToolBasedBooking?: boolean;
  contactName?: string;
  customOutboundPrompt?: string;
  customInboundPrompt?: string;
}

/**
 * Tightened, contrastive wording for the one and only edge in the graph.
 * Ensures the model asks for questions and speaks the closing goodbye line before ending.
 */
const END_CALL_CONDITION =
  'Transition ONLY after you have asked if the caller has any other questions ("याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?"), the caller confirmed they have no more questions (or said no/bye/goodbye), AND you have spoken the closing goodbye line ("खूप खूप धन्यवाद आणि बाय, have a good day!"). Do NOT transition before asking the questions check, and do NOT transition on a single "okay" or during the site visit discussion.';

// Drives the graceful wrap-up via the deterministic get_call_time_remaining tool (always
// attached - see dograhController.ts) instead of having the model guess elapsed time from
// exchange count. See the MAX_CALL_DURATION_SECONDS comment above for the full mechanism.
const CALL_PACING_INSTRUCTION =
  `This call has a soft time limit. Call the get_call_time_remaining tool once after the first ` +
  `couple of exchanges, and again periodically (every few exchanges) if the conversation is ` +
  `continuing - more often once remainingSeconds is getting low. The moment a call to that tool ` +
  `returns "shouldWrapUp": true, say something like "I have a limit on this call, so let's wrap ` +
  `up" in your very next turn, give the caller a brief chance to say anything final, then give a ` +
  `short goodbye and transition to ending the call - do not open new topics or start a fresh ` +
  `line of conversation after that point.`;

export function buildSingleNodeWorkflowDefinition(options: SingleNodeWorkflowOptions) {
  const { personaPrompt, extractionVariables, isOutbound, businessName, toolUuids, preCallFetchUrl, useToolBasedBooking } = options;
  const hasExtraction = extractionVariables.length > 0;
  const hasTools = Boolean(toolUuids && toolUuids.length > 0);
  const isCalendarActive = Boolean(useToolBasedBooking);

  const calendarBookingGuideline = isCalendarActive
    ? `CALENDAR BOOKING (ACTIVE): Live automated calendar scheduling is active. When caller agrees to a visit, use check_availability and book_appointment tools to confirm the slot.`
    : `CALENDAR BOOKING (OFF): Online calendar booking is OFF. Do NOT proactively ask for or propose an appointment or site visit. ONLY if caller explicitly asks for an appointment or visit, note it and say: "नक्कीच, मी नोट करून घेतलं आहे. आमची टीम तुमच्याशी संपर्क साधून वेळ नक्की करेल."`;

  const siteVisitOutboundStep = isCalendarActive
    ? `STEP 6 (PROPOSE SITE VISIT): Pitch: "आपण या वीकेंडला प्रत्यक्ष साईट व्हिजिट करूया का? शनिवारी सोयीचं पडेल की रविवारी? सकाळची वेळ बरी पडेल की दुपारची?". Confirm via calendar tools.`
    : `STEP 6 (CALENDAR BOOKING IS OFF): Do NOT proactively pitch or propose an appointment or site visit. ONLY if the customer explicitly asks for a visit, note it and say: "नक्कीच, मी नोट करून घेतलं आहे. आमची टीम तुमच्याशी संपर्क साधून वेळ नक्की करेल."`;

  const siteVisitInboundStep = isCalendarActive
    ? `7. PROPOSE SITE VISIT: Proactively invite them for a site visit this weekend: "आपण या वीकेंडला प्रत्यक्ष साईट व्हिजिट करूया का? शनिवारी सोयीचं पडेल की रविवारी? सकाळची वेळ बरी पडेल की दुपारची?". Confirm via calendar tools.`
    : `7. CALENDAR BOOKING IS OFF: Do NOT proactively propose or ask for an appointment or site visit. ONLY if the caller explicitly asks for a visit or appointment, note it politely and say: "नक्कीच, मी नोट करून घेतलं आहे. आमची टीम तुमच्याशी संपर्क साधून वेळ नक्की करेल."`;

  const outboundGreetingStep = options.contactName
    ? `STEP 1 (GREETING & PURPOSE): Greet respectfully using the customer's name "${options.contactName}".
- If female name or title, say: "नमस्कार ${options.contactName} मॅडम, मी प्रिया, ${businessName} कडून बोलतेय. २ मिनिटं वेळ आहे का?".
- If male name or title, say: "नमस्कार ${options.contactName} सर, मी प्रिया, ${businessName} कडून बोलतेय. २ मिनिटं वेळ आहे का?".
- If uncertain from name, say: "नमस्कार ${options.contactName} जी, मी प्रिया, ${businessName} कडून बोलतेय. २ मिनिटं वेळ आहे का?".
- In subsequent turns, adjust honorific ("मॅडम" or "सर") based on their voice and Marathi speech.`
    : `STEP 1 (GREETING & PURPOSE): Greet respectfully. Say: "नमस्कार, मी प्रिया, ${businessName} कडून बोलतेय. २ मिनिटं वेळ आहे का?".`;

  const conversationPrompt = (isOutbound
    ? `This is an OUTBOUND call for ${businessName}. You are Priya, a warm, polite Marathi telecaller. Follow this CONVERSATION FLOW in exact order across turns:

${outboundGreetingStep}
STEP 2 (QUALIFYING): Ask: "तुम्ही स्वतः राहण्यासाठी प्लॉट बघताय की इन्व्हेस्टमेंटसाठी?".
STEP 3 (PLOT SIZE / SQFT): Ask: "साधारण किती स्क्वेअर फूटचा प्लॉट शोधत आहात? आमच्याकडे १२००, १५००, २००० ते ५००० स्क्वेअर फूटपर्यंतचे प्लॉट्स आहेत.".
STEP 4 (MANDATORY BUDGET QUESTION): In the very next turn, ask politely: "आणि तुमचं साधारण काय बजेट प्लॅन केलंय?". NEVER skip asking for budget.
STEP 5 (PROJECT HIGHLIGHTS): Share attractive 2-sentence highlights of ${businessName} strictly from the knowledge base (110+ acres, 1 km riverfront, NMRDA sanctioned).
${siteVisitOutboundStep}
${calendarBookingGuideline}
STEP 7 (MANDATORY CHECK FOR QUESTIONS BEFORE CLOSING): NEVER end the call without asking: "याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?".
STEP 8 (WHATSAPP SUMMARY & CLOSE): Only after customer says they have no other questions, conclude: "नक्कीच, मी लगेच याच नंबरवर व्हॉट्सॲपला सर्व माहिती पाठवून देते. खूप खूप धन्यवाद आणि बाय, have a good day!" and end the call.

CRITICAL RULES:
- NEVER EVER ask the customer for their mobile number, phone number, or email. All contact details are already known in the system.
- HONORIFICS: NEVER say "सर/मॅडम" together. Use "सर" for male, "मॅडम" for female, or neutral if unknown.
- CLOSING: Always say "बाय, have a good day!" when ending the call. NEVER say "नमस्कार" or "namaskar" at the end of the call.
- NEVER end the call without first asking: "याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?".`
    : `You are Priya, the warm, polite and highly natural AI Receptionist for ${businessName}. Follow this CONVERSATION FLOW across turns:

1. GREETING: On call pickup OR if caller says "हॅलो" / speaks first, speak immediately: "नमस्कार! ${businessName} मध्ये आपले स्वागत आहे, मी प्रिया बोलतेय. आज मी आपल्यासाठी कशी मदत करू शकते?".
2. ASK NAME IN NEXT TURN: When caller explains why they called or asks about plots, acknowledge warmly and ALWAYS ask their name first: "नक्कीच! त्याबद्दल मी सर्व माहिती देते. त्याआधी आपलं शुभनाव जाणून घेऊ शकते का?".
3. RESPECTFUL ADDRESS: Once they tell their name, address them respectfully with their name (e.g. "[Name] सर" or "[Name] मॅडम"). If gender unknown, speak neutrally without title. NEVER say "सर/मॅडम" together.
4. QUALIFY REQUIREMENT: Ask whether they want a plot for living or investment, and desired sqft (1200, 1500, 2000 to 5000 sqft).
5. MANDATORY BUDGET QUESTION: In the very next turn after discussing requirement or size, ALWAYS ask explicitly: "आणि तुमचं साधारण काय बजेट प्लॅन केलंय?". NEVER skip asking for budget.
6. PROJECT HIGHLIGHTS: Share attractive 2-sentence highlights strictly from project details (110+ acres, 1 km riverfront promenade, NMRDA sanctioned).
${siteVisitInboundStep}
${calendarBookingGuideline}
8. MANDATORY CHECK FOR QUESTIONS BEFORE CLOSING: NEVER conclude or say goodbye abruptly. You MUST always ask: "याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?". Only after the caller confirms they have no further questions, proceed to closing.
9. CLOSING: Conclude warmly: "नक्कीच, मी लगेच याच नंबरवर व्हॉट्सॲपला सर्व माहिती पाठवून देते. खूप खूप धन्यवाद आणि बाय, have a good day!" and end the call.

CRITICAL RULES:
- NEVER EVER ask the caller for their mobile number, phone number, or email. The caller's phone number is already automatically captured via Caller ID.
- Always speak immediately. Never stay silent.
- Keep turns short (1-2 sentences). Ask only 1 question at a time.
- NEVER say "सर/मॅडम" together.
- Say "१ किलोमीटर" (NOT kimi).
- NEVER end the call without first asking: "याव्यतिरिक्त प्रोजेक्टबद्दल तुम्हाला आणखी काही माहिती किंवा प्रश्न विचारायचा आहे का?".
- NEVER say "नमस्कार" or "namaskar" at the end of the call. Conclude with "बाय, have a good day!".`) +
    ` ${CALL_PACING_INSTRUCTION}`;

  const validPreCallFetchUrl = preCallFetchUrl && preCallFetchUrl.trim().length > 0 ? preCallFetchUrl.trim() : undefined;

  const conversationNode = {
    id: '1',
    type: 'startCall',
    position: { x: 320, y: 0 },
    data: {
      name: 'Conversation',
      prompt: conversationPrompt,
      allow_interrupt: false,
      add_global_prompt: true,
      delayed_start: isOutbound,
      delayed_start_duration: isOutbound ? 1.5 : undefined,
      pre_call_fetch_enabled: Boolean(validPreCallFetchUrl),
      pre_call_fetch_url: validPreCallFetchUrl,
      extraction_enabled: hasExtraction,
      extraction_prompt: hasExtraction
        ? 'Capture any lead details the caller has shared so far, even if only partially mentioned. Keep previously captured values unless the caller corrects them.'
        : undefined,
      extraction_variables: hasExtraction ? extractionVariables : undefined,
      tool_uuids: hasTools ? toolUuids : undefined,
    },
  };

  const endCallNode = {
    id: '2',
    type: 'endCall',
    position: { x: 640, y: 0 },
    data: {
      name: 'End Call',
      prompt: 'Say warmly: "खूप खूप धन्यवाद आणि बाय, have a good day!" then immediately end the call. NEVER say "नमस्कार" or "namaskar" at the end of the call.',
      add_global_prompt: false,
    },
  };

  const nodes = [
    {
      id: '0',
      type: 'globalNode',
      position: { x: 0, y: 0 },
      data: {
        name: 'Persona',
        prompt: personaPrompt,
      },
    },
    conversationNode,
    endCallNode,
  ];

  const edges = [
    {
      id: `${conversationNode.id}-${endCallNode.id}`,
      type: 'custom',
      source: conversationNode.id,
      target: endCallNode.id,
      data: {
        condition: END_CALL_CONDITION,
        label: 'End call',
        invalid: false,
        validationMessage: null,
      },
      animated: false,
      selected: false,
    },
  ];

  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * Inbound rate limiting is enforced by swapping the phone number to this workflow before the
 * next call arrives. It intentionally does not load the business persona, knowledge base,
 * extraction variables, pre-call fetch, or calendar tools. The only attached tool is a silent
 * end_call tool, so rate-limited calls terminate with the least possible Dograh/LLM work.
 */
export function buildCapacityWorkflowDefinition(endCallToolUuid: string) {
  return {
    nodes: [
      {
        id: '1',
        type: 'startCall',
        position: { x: 320, y: 0 },
        data: {
          name: 'Capacity Hangup',
          prompt:
            'This number is temporarily at capacity. Immediately call the attached end-call tool. ' +
            'Say nothing, do not greet, do not answer questions, and do not continue the conversation.',
          allow_interrupt: false,
          add_global_prompt: false,
          delayed_start: false,
          extraction_enabled: false,
          tool_uuids: [endCallToolUuid],
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
