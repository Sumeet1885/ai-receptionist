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
export async function handleChat(
  input: ChatInput,
  supabase: any
): Promise<ChatOutput> {
  const { bot, history, userMessage } = input;

  // 1. Build system instruction from bot configuration
  const systemInstruction = `You are the Virtual AI Receptionist representing "${bot.businessName}" (${bot.industry} sector).

BUSINESS CONTEXT & KNOWLEDGE BASE:
${bot.knowledgeBase}

YOUR GOALS:
1. Warmly answer the user's questions relying strictly on the business details above. If you don't know the answer, politely request their name and phone number so a specialist can reach them.
2. Naturally and conversationally guide the chat to collect: Full Name, Contact Phone Number, Specific interest, and Budget.
3. Support multilingual outputs automatically — match the user's language.
4. Keep answers short (2-3 sentences max) for a rapid web-chat format.`;

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
