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
// a silent CancelFrame with no goodbye, so it's a backstop, not the primary UX. The persona
// prompt below is told to proactively wind down well before this so the call ends gracefully
// instead of getting cut off mid-sentence. Dograh exposes no mid-call timer/warning hook
// (confirmed by reading pipeline_engine_callbacks_processor.py - it only supports a single abort
// threshold, no separate warning callback), so "around 4:30" is necessarily a prompt-level
// approximation the model self-paces to, not a precisely-timed event.
export const MAX_CALL_DURATION_SECONDS = 300;

export interface SingleNodeWorkflowOptions {
  /** Full persona text (buildDograhPhoneInstruction/buildDograhOutboundInstruction output),
   * placed verbatim on the global node and prepended to the conversation node at runtime. */
  personaPrompt: string;
  extractionVariables: ExtractionVariable[];
  isOutbound: boolean;
  businessName: string;
  /** Tool UUIDs (dograhClient.createOrUpdateHttpTool) attached to the conversation node -
   * check_availability/book_appointment, present only when the bot's owner has a calendar
   * connected (see dograhController.ts). Omitted entirely (not just empty) otherwise, matching
   * the persona's verbal-handoff booking instruction in that case. */
  toolUuids?: string[];
  /** Fetched once before the call connects and merged into initial_context - used to create the
   * chat_sessions row up front so calendar tool calls during the call and the post-call mirror
   * (callMirror.ts) bind to the same session instead of racing each other. */
  preCallFetchUrl?: string;
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

// Best-effort pacing instruction appended to the conversation prompt - see the
// MAX_CALL_DURATION_SECONDS comment above for why this can't be tied to an exact second count.
const CALL_PACING_INSTRUCTION =
  `This call has a hard 5-minute limit. Pace yourself accordingly: keep answers brief, avoid ` +
  `re-explaining things, and once the conversation has covered the caller's questions and (if ` +
  `applicable) their contact details, move toward closing rather than opening new topics. If ` +
  `the conversation has clearly been going on for a while (many exchanges back and forth) and ` +
  `is not yet wrapping up, proactively say something like "I have a limit on this call, so ` +
  `let's wrap up" and steer toward a close within the next turn or two, even if the caller ` +
  `hasn't said goodbye yet.`;

export function buildSingleNodeWorkflowDefinition(options: SingleNodeWorkflowOptions) {
  const { personaPrompt, extractionVariables, isOutbound, businessName, toolUuids, preCallFetchUrl } = options;
  const hasExtraction = extractionVariables.length > 0;
  const hasTools = Boolean(toolUuids && toolUuids.length > 0);

  // No `greeting`/`greeting_type` here - Dograh's docs are explicit that the static TTS-only
  // greeting field is "not supported with realtime (speech-to-speech) models" (this org runs
  // Gemini Live - see model-configurations/v2). The earlier cascaded STT->LLM->TTS pipeline
  // needed that field to fill 7-20s of dead air before the model's first response; a
  // speech-to-speech model has no such cold-start gap, so the opening line goes back into the
  // prompt itself, said directly by the model on its first turn.
  const conversationPrompt = (isOutbound
    ? `This is the only conversational step for the entire call - you placed this call. Begin ` +
      `immediately by introducing yourself and ${businessName} by name, and briefly explaining ` +
      `you're following up with someone who showed interest. Then handle the rest of the ` +
      `conversation across as many turns as needed: answer questions, and collect lead details ` +
      `per the persona above. When the conversation is clearly finished, transition to ending ` +
      `the call.`
    : `This is the only conversational step for the entire call. Begin immediately by warmly ` +
      `greeting the caller on behalf of ${businessName} and asking how you can help. Then handle ` +
      `the entire conversation across as many turns as needed: answer questions, and collect ` +
      `lead details per the persona above. When the conversation is clearly finished, transition ` +
      `to ending the call.`) +
    ` ${CALL_PACING_INSTRUCTION}`;

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
        prompt: conversationPrompt,
        // false (Dograh's own default for startCall, which we'd overridden to true): this
        // self-hosted telephony audio path has no echo cancellation at the Plivo/Twilio <->
        // Dograh audio bridge, so the bot's own voice bleeding back into the input was getting
        // misheard as the caller interrupting, truncating the bot mid-word. That's a transport-
        // layer issue independent of which model is on the other end (cascaded pipeline or
        // speech-to-speech), so it stays disabled under Gemini Live too unless that's confirmed
        // fixed. Caller can still always just start talking once the bot pauses between turns -
        // this only stops the bot from cutting itself off on its own echo.
        allow_interrupt: false,
        add_global_prompt: true,
        delayed_start: isOutbound,
        delayed_start_duration: isOutbound ? 1.5 : undefined,
        extraction_enabled: hasExtraction,
        extraction_prompt: hasExtraction
          ? 'Capture any lead details the caller has shared so far, even if only partially mentioned. Keep previously captured values unless the caller corrects them.'
          : undefined,
        extraction_variables: hasExtraction ? extractionVariables : undefined,
        tool_uuids: hasTools ? toolUuids : undefined,
        // Creates the chat_sessions row before the call connects (see phoneToolsController.ts'
        // pre-call endpoint) so check_availability/book_appointment tool calls during the call,
        // and the post-call mirror in callMirror.ts, all bind to the same session id instead of
        // each independently creating one and racing.
        pre_call_fetch_enabled: Boolean(preCallFetchUrl),
        pre_call_fetch_url: preCallFetchUrl,
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
