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
  'Transition ONLY when the caller indicates they want to hang up or wrap up (for example: "thank you goodbye", "that\'s all I needed", "talk to you later", "bye", "have a good day"), OR when you have answered all their questions, confirmed there is nothing else, and said goodbye. Do NOT transition on a single "okay", "sure", or during an active discussion.';

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
  const { personaPrompt, extractionVariables, isOutbound, businessName, toolUuids, preCallFetchUrl } = options;
  const hasExtraction = extractionVariables.length > 0;
  const hasTools = Boolean(toolUuids && toolUuids.length > 0);

  const defaultOutboundPrompt =
    `This is an OUTBOUND call placed on behalf of ${businessName}. Follow the goals ` +
    `and constraints from the global persona: introduce yourself and the business, state the reason ` +
    `for calling, answer questions relying strictly on the knowledge base, and collect any ` +
    `required details or assist with scheduling per persona instructions. Once the customer's ` +
    `questions are answered and the conversation is clearly finished, transition to ending the call.`;

  const defaultInboundPrompt =
    `Answer the caller's questions warmly and professionally relying strictly on the business details and ` +
    `persona in the global prompt for ${businessName}. Collect missing contact details conversationally, ` +
    `and assist with inquiries or appointment bookings per the persona instructions. Once the conversation ` +
    `is clearly finished, transition to ending the call.`;

  const conversationPrompt = isOutbound
    ? (options.customOutboundPrompt?.trim() || defaultOutboundPrompt) + ` ${CALL_PACING_INSTRUCTION}`
    : (options.customInboundPrompt?.trim() || defaultInboundPrompt);

  const validPreCallFetchUrl = preCallFetchUrl && preCallFetchUrl.trim().length > 0 ? preCallFetchUrl.trim() : undefined;

  const conversationNode = {
    id: '1',
    type: 'startCall',
    position: { x: 320, y: 0 },
    data: {
      name: 'Conversation',
      prompt: conversationPrompt,
      allow_interrupt: true,
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
