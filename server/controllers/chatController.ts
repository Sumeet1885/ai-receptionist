// @ts-nocheck
import { Bot, Message } from '../types/index.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

export interface ChatInput {
  bot: Bot;
  history: Message[];
  userMessage: string;
}

export interface ChatOutput {
  reply: string;
}

/**
 * Builds the system instruction from the bot's knowledge base and calls Gemini.
 * Saves both the user message and bot reply into the messages table.
 */
function isHandoffRequest(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const handoffPatterns = [
    /\b(talk|speak|connect|contact|chat|get|call|want|need|request|reach|page)\s+(to|with|for|a|an)?\s*(human|support|agent|person|representative|staff|helper|receptionist|manager|team)\b/i,
    /\b(human\s+support|live\s+agent|live\s+support|human\s+agent|real\s+person|customer\s+service)\b/i,
    /\b(contact|connect|talk|speak)\s+(us|me)?\s*(to|with)?\s*(support|human|agent)\b/i,
    /^\s*(human|support|agent|receptionist|handoff|contact\s+support|talk\s+to\s+human|support\s+please)\s*$/i,
    /\b(support|human|receptionist|agent)\b.*\b(please|now|help|needed|required)\b/i
  ];
  return handoffPatterns.some(pattern => pattern.test(normalized));
}

export async function handleChat(
  input: ChatInput,
  supabase: any
): Promise<ChatOutput> {
  const { bot, history, userMessage } = input;

  const handoffText = bot.widget_config?.handoffText || bot.widgetConfig?.handoffText || 'I can connect you with the team for this.';
  if (isHandoffRequest(userMessage)) {
    return { reply: handoffText };
  }

  // 1. Build system instruction from bot configuration
  const systemInstruction = `You are the Virtual AI Receptionist representing "${bot.businessName}" (${bot.industry} sector).

BUSINESS CONTEXT & KNOWLEDGE BASE:
${bot.knowledgeBase}

YOUR GOALS:
1. Warmly answer the user's questions relying strictly on the business details above. If you don't know the answer, politely request their name and phone number so a specialist can reach them.
2. HUMAN HANDOFF & SUPPORT: If the user wishes or asks to talk to or connect with/contact support, a human, an agent, or a real person, you must respond with exactly the following handoff text and nothing else: "${handoffText}".
3. Naturally and conversationally guide the chat.
4. Support multilingual outputs automatically — match the user's language.
5. Keep answers short (2-3 sentences max) for a rapid web-chat format.`;

  // 2. Build prompt from rolling conversation history
  const promptText = `Chat history so far:\n${history
    .map(m => `${m.sender === 'user' ? 'User' : 'Receptionist'}: ${m.text}`)
    .join('\n')}\nUser: ${userMessage}\n\nReceptionist response:`;

  // 3. Call Gemini REST API
  const geminiResponse = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    })
  });

  if (!geminiResponse.ok) {
    throw new Error(`Gemini API error: ${geminiResponse.status}`);
  }

  const geminiData = await geminiResponse.json();
  const reply: string =
    geminiData.candidates?.[0]?.content?.parts?.[0]?.text ??
    'Thank you for your message. A specialist will contact you shortly.';

  return { reply };
}
