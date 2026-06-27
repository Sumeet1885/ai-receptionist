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

export interface SingleNodeWorkflowOptions {
  /** Full persona text (buildDograhPhoneInstruction/buildDograhOutboundInstruction output),
   * placed verbatim on the global node and prepended to the conversation node at runtime. */
  personaPrompt: string;
  extractionVariables: ExtractionVariable[];
  isOutbound: boolean;
  businessName: string;
}

/**
 * Tightened, contrastive wording for the one and only edge in the graph. Small models misfire
 * forced-choice edge conditions under ambiguity, so this spells out both the positive case
 * (when to end) and the negative case (when NOT to, i.e. keep going) instead of leaving the
 * "otherwise" branch implicit.
 */
const END_CALL_CONDITION =
  'Transition ONLY when the caller has clearly indicated the conversation is over - for example ' +
  'they say goodbye, "that\'s all", "no more questions", or explicitly ask to end/hang up the ' +
  'call, OR all of their questions have been answered AND (if the persona above asks for contact ' +
  'details) those details have already been collected. Do NOT transition merely because of a ' +
  'short reply, a single "okay"/"thanks", a brief pause, or uncertainty about what to do next - ' +
  'in those cases keep the conversation going by asking a clarifying or follow-up question instead.';

export function buildSingleNodeWorkflowDefinition(options: SingleNodeWorkflowOptions) {
  const { personaPrompt, extractionVariables, isOutbound, businessName } = options;
  const hasExtraction = extractionVariables.length > 0;

  // A static, TTS-only greeting that plays immediately on connect, with no LLM round-trip.
  // The first LLM turn (prompt + persona) on a cold STT/LLM/TTS connection measured 7-20s of
  // dead air in testing - long enough that callers assumed the line was dead or the agent
  // couldn't hear them. The greeting fills that gap; the prompt tells the model it already ran.
  const greeting = isOutbound
    ? `Hello! This is the virtual receptionist calling on behalf of ${businessName}.`
    : `Thanks for calling ${businessName}! How can I help you today?`;

  const conversationPrompt = isOutbound
    ? 'You already greeted the caller (see greeting above) - do not greet again. This is the only ' +
      'conversational step for the entire call. Explain why you are calling, then handle the rest ' +
      'of the conversation across as many turns as needed: answer questions, and collect lead ' +
      'details per the persona above. When the conversation is clearly finished, transition to ' +
      'ending the call.'
    : 'You already greeted the caller (see greeting above) - do not greet again. This is the only ' +
      'conversational step for the entire call. Handle the entire conversation across as many ' +
      'turns as needed: answer questions, and collect lead details per the persona above. When ' +
      'the conversation is clearly finished, transition to ending the call.';

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
    {
      id: '1',
      type: 'startCall',
      position: { x: 320, y: 0 },
      data: {
        name: 'Conversation',
        greeting_type: 'text',
        greeting,
        prompt: conversationPrompt,
        // false (Dograh's own default for startCall, which we'd overridden to true): this
        // self-hosted telephony audio path has no echo cancellation, so the bot's own voice
        // bleeding back into the input was getting misheard as the caller interrupting,
        // truncating the bot's sentences mid-word. Caller can still always just start talking
        // once the bot pauses between turns - this only stops the bot cutting itself off.
        allow_interrupt: false,
        add_global_prompt: true,
        delayed_start: isOutbound,
        delayed_start_duration: isOutbound ? 1.5 : undefined,
        extraction_enabled: hasExtraction,
        extraction_prompt: hasExtraction
          ? 'Capture any lead details the caller has shared so far, even if only partially mentioned. Keep previously captured values unless the caller corrects them.'
          : undefined,
        extraction_variables: hasExtraction ? extractionVariables : undefined,
      },
    },
    {
      id: '2',
      type: 'endCall',
      position: { x: 640, y: 0 },
      data: {
        name: 'End Call',
        prompt: 'Give a brief, warm closing (one short sentence) thanking the caller, then end the call.',
        add_global_prompt: false,
      },
    },
  ];

  const edges = [
    {
      id: '1-2',
      type: 'custom',
      source: '1',
      target: '2',
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
