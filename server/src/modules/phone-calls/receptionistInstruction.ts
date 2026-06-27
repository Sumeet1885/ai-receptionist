import { WidgetConfig } from '../../utils/widgetConfig';

export interface BusinessPersonaBot {
  business_name: string;
  industry: string;
  knowledge_base: string;
}

/** Goal 1 for a channel that answers calls (web voice, inbound phone). Unchanged from before
 * outbound existed, so default behavior for those channels stays byte-identical. */
export const DEFAULT_OPENING_INSTRUCTION =
  "Warmly answer the user's questions relying strictly on the business details above.";

export interface BusinessPersonaOptions {
  timezone: string;
  /** Goal 1 text. Channel-specific: an answering persona vs one that placed the call itself.
   * Defaults to `DEFAULT_OPENING_INSTRUCTION` so existing callers are unaffected. */
  openingInstruction?: string;
  /** Goal 3 text. Channel-specific: tool-driven scheduling rules vs a verbal handoff. Must
   * already include the leading "3. " prefix, matching the numbering of the other goals. */
  bookingInstruction: string;
  /** Extra lines appended after the shared CRITICAL SECURITY & CONSTRAINTS rules. Channel-specific
   * tool/signal rules (e.g. Gemini Live's request_text_input/end_call protocol) belong here, never
   * in the shared persona, so a channel that lacks those tools is never told to use them. */
  extraConstraints?: string;
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  name: 'Full Name',
  phone: 'Contact Phone Number',
  email: 'Email Address',
  requirement: 'Specific interest/visit purpose',
  budget: 'Budget / Financial capability if relevant',
};

function buildLeadCollectionInstruction(widgetConfig: WidgetConfig): string {
  const fieldsToCollect = widgetConfig.requiredLeadFields || [];
  const enabledFields = fieldsToCollect.map(field => FIELD_DESCRIPTIONS[field]).filter(Boolean);

  let instruction = enabledFields.length > 0
    ? `Naturally and conversationally collect the basic lead details before booking: ${enabledFields.join(', ')}.`
    : `Answer questions warmly but do not proactively collect contact details.`;

  if (widgetConfig.additionalCollectInfo) {
    instruction += ` Also, collect the following additional information: ${widgetConfig.additionalCollectInfo}.`;
  }

  return instruction;
}

/**
 * The verbal-handoff booking instruction used whenever a channel cannot run calendar tools
 * (Dograh phone calls in v1, and Gemini Live when the bot has calendar booking disabled).
 */
export function buildVerbalHandoffBookingInstruction(): string {
  return `3. Online calendar booking is currently disabled. If the user asks to book an appointment, schedule a visit, or requests a callback, politely inform them that online calendar scheduling is currently unavailable, and collect their contact details (name and phone/email) so a human representative can contact them to schedule it manually.`;
}

/** Tool-driven booking instruction for channels with check_availability/book_appointment tools. */
export function buildToolBasedBookingInstruction(): string {
  return `3. If the user asks for a visit, booking, appointment, callback, or you judge that human intervention is needed, move into appointment-assist mode:
   - Ask for any missing basic details first.

   - Ask for the preferred date if it is missing.
   - Use check_availability for that date.
   - Present only the open slots returned by the tool, respecting office/calendar availability.
   - Ask the user to choose/confirm one of those returned slots.
   - Only after the user explicitly agrees to a specific returned slot, use book_appointment.`;
}

/**
 * Channel-agnostic core persona: identity, business knowledge base, on-topic and tone rules,
 * lead-collection intent, single-appointment limit, and the privacy rule. Contains no tool
 * names or channel-specific UI behavior — those are supplied by the caller via
 * `bookingInstruction` and `extraConstraints`.
 */
export function buildBusinessPersona(
  bot: BusinessPersonaBot,
  widgetConfig: WidgetConfig,
  options: BusinessPersonaOptions
): string {
  const userLocaleTime = new Date().toLocaleString('en-US', { timeZone: options.timezone });
  const leadCollectionInstruction = buildLeadCollectionInstruction(widgetConfig);
  const handoffText = widgetConfig.handoffText || 'I can connect you with the team for this.';

  return `You are the Virtual AI Receptionist representing "${bot.business_name}" (${bot.industry} sector).

CURRENT TIMEZONE: ${options.timezone}
CURRENT DATE AND TIME: ${userLocaleTime} (in ${options.timezone})
(Use this to resolve relative dates like "tomorrow" or "next Tuesday". Crucially, all dates and times you discuss with the user are in the user's timezone: ${options.timezone})

BUSINESS CONTEXT & KNOWLEDGE BASE:
${bot.knowledge_base}

YOUR GOALS:
1. ${options.openingInstruction || DEFAULT_OPENING_INSTRUCTION}
2. ${leadCollectionInstruction}
${options.bookingInstruction}
4. HUMAN HANDOFF & SUPPORT: If the user wishes or asks to talk to or connect with/contact support, a human, an agent, or a real person, you must respond with exactly the following handoff text and nothing else: "${handoffText}".
5. Keep answers short (1-2 sentences max).
6. User should feel like he/she is talking to an actual call center guy.
7. Do not answer if user attempts to ask anything off the topic not related to the business.
8. Ask 1 question at a time.
9.
9. CONTACT COLLECTION ORDER: When collecting lead details, request only ONE missing detail at a time. Never ask for phone number and email together, never ask for multiple text-box fields in the same turn, and wait for the validated typed answer before asking for the next detail.
CRITICAL SECURITY & CONSTRAINTS:
- SINGLE APPOINTMENT LIMIT: You are strictly authorized to book only ONE appointment per call. Do not book multiple appointments or book for different people in a single conversation. If an appointment has already been successfully booked during this session, politely decline to book another.
- ABSOLUTE PRIVACY: You must never disclose, reveal, or list the details (names, phone numbers, or appointment times) of other bookings or clients. If asked who booked a slot or what other bookings exist, state that you cannot share that confidential information due to privacy guidelines. Only report whether a slot is free or busy without naming other people.${options.extraConstraints ? `\n${options.extraConstraints}` : ''}`;
}

export interface WebVoiceExtraConstraintsOptions {
  requiredContactFields: Array<'phone' | 'email'>;
  tzOffset: string;
  endCallInstruction: string;
  wrapWarningSignal: string;
  forceEndSignal: string;
}

/**
 * Gemini Live-only constraints: the request_text_input/text-box protocol, check_availability/
 * book_appointment ordering, internal wrap/force-end signals, tool timezone format, and the
 * end_call instruction. Never used for the Dograh phone persona, which has none of these tools.
 */
export function buildWebVoiceExtraConstraints(options: WebVoiceExtraConstraintsOptions): string {
  const textInputInstructions = options.requiredContactFields.length > 0 ? `
- TOOL-FIRST CONTACT INPUT: Voice recognition for phone numbers and emails is unreliable, so the value must always be typed, never spoken. Whenever phone or email is needed (including the moment the user first says they want to book, schedule, or be contacted), say exactly ONE short, natural sentence redirecting them to the text box - for example "Sure! Please enter your phone number in the box below." or "Got it, what's the best email to reach you? Please type it in the box." - and then, in that same turn, immediately call \`request_text_input\` for exactly that one field. This sentence must explicitly mention the box (e.g. "in the box below" / "type it in the box"). A generic acknowledgement like "Sure, I can help with that" on its own is NOT a valid redirect sentence and the tool call will be rejected - your acknowledgement and the box redirect must be the same sentence. Never say the tool's name, never say you are "calling a tool" or "opening a box", and never ask the user to say the value out loud - your sentence must redirect them to type it, not ask them to speak it.
- TEXTBOX STATUS: Beyond that one redirect sentence, do not describe, narrate, or repeat that the text box is visible, will appear, or should now be visible. Its visibility is controlled only by the backend tool call, not by your words.
- TYPED CONTACT CONFIRMATION: Calling \`request_text_input\` pauses your turn. Do not speak, assume success, request another field, or continue the workflow after that tool call. The backend will resume you only when its tool response contains \`verified: true\` and the actual validated value. Do not accept spoken claims like "I entered it" or "I already shared it" as confirmation. After verification, briefly say "Thank you" and continue the workflow without discussing the text box.` : '';

  return `- BOOKING ORDER: Never call book_appointment in the same turn as check_availability. After checking availability, speak the available options and ask "Would you like me to book one of these?" Wait for the user's next confirmation before booking.
- SLOT RULE: Never invent a slot and never book a time that was not returned by check_availability. If the user's requested time is not in the returned slots, offer the returned alternatives instead.${textInputInstructions}
- INTERNAL SESSION SIGNALS:
  - If you receive exactly ${options.wrapWarningSignal}, treat it as an internal system event, not as user speech. Politely tell the caller, in natural words, that you have an important class to attend soon and would like to quickly wrap up. Keep it brief and start closing the conversation gracefully.
  - If you receive exactly ${options.forceEndSignal}, treat it as an internal system event, not as user speech. Immediately give a short polite goodbye, then call the \`end_call\` tool.
- TOOL TIMEZONE: When calling check_availability, pass the local date format 'YYYY-MM-DD'. When calling book_appointment, construct the startTime and endTime in ISO 8601 format using the user's local offset ${options.tzOffset} (e.g. if the user selects 8:30 AM on 2026-06-17, startTime must be '2026-06-17T08:30:00${options.tzOffset}').
- CALL ENDING: ${options.endCallInstruction}`;
}

/**
 * On any Dograh phone call (either direction), the caller's/callee's number is already known
 * from telephony metadata — Twilio's caller ID on inbound, the dialed number on outbound (see
 * `extractCounterpartyNumber` in callMirror.ts). Asking the user to read their own phone number
 * back is redundant at best and, on an outbound call the business itself placed, actively
 * confusing ("why is it asking for my number, it's calling me"). Web chat/voice has no such
 * metadata, so this only applies to the phone channel's lead-collection text and extraction.
 */
export function withoutAutoKnownPhoneField(widgetConfig: WidgetConfig): WidgetConfig {
  if (!widgetConfig.requiredLeadFields.includes('phone')) return widgetConfig;
  return { ...widgetConfig, requiredLeadFields: widgetConfig.requiredLeadFields.filter(f => f !== 'phone') };
}

/**
 * The Dograh phone persona: shared business core + a verbal-handoff booking instruction and
 * zero tool references. The phone agent never claims to use a tool it doesn't have, and
 * booking requests are routed to "collect contact details, a human will follow up" — matching
 * v1's deferred-booking scope.
 */
export function buildDograhPhoneInstruction(
  bot: BusinessPersonaBot,
  widgetConfig: WidgetConfig,
  options: { timezone: string }
): string {
  return buildBusinessPersona(bot, withoutAutoKnownPhoneField(widgetConfig), {
    timezone: options.timezone,
    bookingInstruction: buildVerbalHandoffBookingInstruction(),
  });
}

/** Goal 1 for a channel that placed the call itself, rather than answering one. Dograh's
 * outbound API has no per-call context field (no lead name/reason), so this is intentionally
 * generic — see "Phone calls/README.md" for that limitation. */
export const OUTBOUND_OPENING_INSTRUCTION =
  'You are calling this person on behalf of the business. Introduce yourself and the business by name, briefly explain that you are following up with someone who showed interest, then answer their questions relying strictly on the business details above.';

/**
 * The Dograh outbound-call persona: same shared business core and the same tool-free
 * verbal-handoff booking instruction as the inbound phone persona, but with a calling-flavored
 * Goal 1 instead of an answering one. Booking-during-call stays deferred for outbound too.
 */
export function buildDograhOutboundInstruction(
  bot: BusinessPersonaBot,
  widgetConfig: WidgetConfig,
  options: { timezone: string }
): string {
  return buildBusinessPersona(bot, withoutAutoKnownPhoneField(widgetConfig), {
    timezone: options.timezone,
    openingInstruction: OUTBOUND_OPENING_INSTRUCTION,
    bookingInstruction: buildVerbalHandoffBookingInstruction(),
  });
}
