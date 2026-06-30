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

// Dograh recording_id for the shared "too many requests, please try again later" audio, uploaded
// once via scripts/upload-rate-limit-recording.ts (a Gemini TTS synthesis, not a system-prompt
// instruction - see dograhController.ts's ensureRateLimitTool). Empty until that script has been
// run against the target Dograh instance; dograhController.ts falls back to no gate node at all
// when this is unset, rather than wiring a tool with an invalid/missing recording reference.
export const RATE_LIMITED_RECORDING_ID = 'qjow4ajs';

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
  /** Inbound only. The end_call tool (dograhClient.createEndCallTool, messageType "audio") that
   * plays the rate-limit decline recording and hangs up - see the gate-node comment below for
   * why this exists as a tool/separate node instead of a system-prompt instruction. */
  rateLimitEndCallToolUuid?: string;
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
  'details) those details have already been collected, OR get_call_time_remaining has reported ' +
  '"shouldWrapUp": true and you have already said your wrap-up line and a brief goodbye. Do NOT ' +
  'transition merely because of a short reply, a single "okay"/"thanks", a brief pause, or ' +
  'uncertainty about what to do next - in those cases keep the conversation going by asking a ' +
  'clarifying or follow-up question instead.';

// Inbound-only gate node, entirely separate from the conversation node and its persona/knowledge
// base. There's no way to refuse an inbound call before it rings (Plivo calls Dograh directly,
// not this server), so the rate limit gets enforced as the very first thing Dograh does on
// pickup - but as a one-line tool-call decision, not a prose instruction competing for space in
// the main system prompt. RATE_LIMITED itself is computed by phoneToolsController.ts's preCall
// handler (the cooldown/hourly-cap logic lives there); {{initial_context.*}} is Dograh's own
// template syntax, substituted before the model ever sees this text. When true, the gate calls
// the rate-limit end_call tool, which plays a fixed pre-recorded "try again later" recording and
// hangs up directly - no TTS, no LLM-generated speech, and the call never reaches the persona/
// knowledge-base-loaded conversation node at all.
// Defense-in-depth: if the pre-call-fetch request to phoneToolsController.ts ever fails for any
// reason (network blip, the callback URL misconfigured, etc.), Dograh's own pre_call_fetch never
// raises - it just merges an empty object, so the template below renders as a blank/unresolved
// value instead of the literal string "true" or "false". Defaulting an unclear read to "false"
// (proceed normally) is the safe failure direction: a missed rate-limit check costs nothing, a
// falsely-declined real caller costs a lead.
const RATE_LIMIT_GATE_PROMPT =
  `Check this value: RATE_LIMITED={{initial_context.rate_limited}}. Call the rate-limit ` +
  `end-call tool, and say nothing else, ONLY if that value reads exactly "true". For any other ` +
  `value - "false", empty, missing, or anything unclear - say nothing and just wait; the call ` +
  `will move to the next step automatically. When genuinely unsure, treat it as not rate limited.`;

const RATE_LIMIT_GATE_EDGE_CONDITION =
  'Transition immediately unless RATE_LIMITED reads exactly "true" - this should happen with no ' +
  'caller input needed. Only stay on this node if RATE_LIMITED reads "true"; that case ends the ' +
  'call via the rate-limit tool instead and should never reach this edge.';

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
  const { personaPrompt, extractionVariables, isOutbound, businessName, toolUuids, preCallFetchUrl, rateLimitEndCallToolUuid } = options;
  const hasExtraction = extractionVariables.length > 0;
  const hasTools = Boolean(toolUuids && toolUuids.length > 0);
  const hasGate = !isOutbound && Boolean(rateLimitEndCallToolUuid);

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
    : `Begin immediately by warmly greeting the caller on behalf of ${businessName} and asking ` +
      `how you can help. Then handle the entire conversation across as many turns as needed: ` +
      `answer questions, and collect lead details per the persona above. When the conversation ` +
      `is clearly finished, transition to ending the call.`) +
    ` ${CALL_PACING_INSTRUCTION}`;

  // The conversation node is startCall (the graph's entry point) when there's no gate node ahead
  // of it - outbound always, inbound whenever rate limiting isn't configured. With a gate, the
  // gate becomes startCall instead and the conversation becomes a plain agentNode one step later;
  // everything else about it (prompt, tools, extraction) is identical either way.
  const conversationNode = {
    id: hasGate ? '2' : '1',
    type: hasGate ? 'agentNode' : 'startCall',
    position: { x: hasGate ? 640 : 320, y: 0 },
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
      ...(hasGate ? {} : {
        delayed_start: isOutbound,
        delayed_start_duration: isOutbound ? 1.5 : undefined,
        // Pre-call-fetch only goes on whichever node is startCall - an agentNode can't carry it,
        // it's a startCall-only field. With a gate, the gate node (below) carries it instead.
        pre_call_fetch_enabled: Boolean(preCallFetchUrl),
        pre_call_fetch_url: preCallFetchUrl,
      }),
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
    },
  };

  const endCallNode = {
    id: hasGate ? '3' : '2',
    type: 'endCall',
    position: { x: hasGate ? 960 : 640, y: 0 },
    data: {
      name: 'End Call',
      prompt: 'Give a brief, warm closing (one short sentence) thanking the caller, then end the call.',
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
    // Rate-limit gate, inbound only - see RATE_LIMIT_GATE_PROMPT above for why this is a
    // dedicated node with no persona/knowledge base attached (add_global_prompt: false) rather
    // than a prompt instruction tacked onto the real conversation node.
    ...(hasGate ? [{
      id: '1',
      type: 'startCall',
      position: { x: 320, y: 0 },
      data: {
        name: 'Rate Limit Gate',
        prompt: RATE_LIMIT_GATE_PROMPT,
        allow_interrupt: false,
        add_global_prompt: false,
        delayed_start: false,
        pre_call_fetch_enabled: Boolean(preCallFetchUrl),
        pre_call_fetch_url: preCallFetchUrl,
        tool_uuids: [rateLimitEndCallToolUuid],
      },
    }] : []),
    conversationNode,
    endCallNode,
  ];

  const edges = [
    ...(hasGate ? [{
      id: '1-2',
      type: 'custom',
      source: '1',
      target: '2',
      data: {
        condition: RATE_LIMIT_GATE_EDGE_CONDITION,
        label: 'Not rate limited',
        invalid: false,
        validationMessage: null,
      },
      animated: false,
      selected: false,
    }] : []),
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
