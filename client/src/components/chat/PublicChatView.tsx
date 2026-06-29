import React, { useEffect, useRef, useState } from 'react';
import { Bot, Message } from '../../types';
import { Icons } from '../common/Icons';

import { useLiveVoice } from '../../hooks/useLiveVoice';
import { VoiceInput } from '@/components/ui/voice-input';
import { cn } from '@/lib/utils';
import { VoiceCallView } from './VoiceCallView';

interface PublicChatViewProps {
  activeBot: Bot;
  chatMessages: Message[];
  chatInput: string;
  setChatInput: (input: string) => void;
  isBotResponding: boolean;
  handleSendChatMessage: (e: React.FormEvent) => void;
  sessionId: string;
  showSpeech: boolean;
  setShowSpeech: (show: boolean) => void;
  previewMode: 'desktop' | 'mobile';
  setPreviewMode: (mode: 'desktop' | 'mobile') => void;
  setView: (view: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  messageEndRef: React.RefObject<HTMLDivElement | null>;
  isStandalone?: boolean;
}

export const PublicChatView: React.FC<PublicChatViewProps> = ({
  activeBot,
  chatMessages,
  chatInput,
  setChatInput,
  isBotResponding,
  handleSendChatMessage,
  sessionId,
  showSpeech,
  setShowSpeech,
  previewMode,
  setPreviewMode,
  setView,
  showToast,
  messageEndRef,
  isStandalone = false
}: PublicChatViewProps) => {
  const liveVoice = useLiveVoice(activeBot.id, sessionId);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [showVoiceGate, setShowVoiceGate] = useState(false);
  const requiredVoiceContactFields = activeBot.widgetConfig.requiredLeadFields
    .filter((field): field is 'phone' | 'email' => field === 'phone' || field === 'email');

  useEffect(() => {
    const messagesContainer = messagesContainerRef.current;
    if (!messagesContainer) return;

    const behavior: ScrollBehavior = chatMessages.length <= 1 ? 'auto' : 'smooth';
    requestAnimationFrame(() => {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior,
      });
    });
  }, [chatMessages, isBotResponding]);

  useEffect(() => {
    if (showVoiceGate && (liveVoice.isConnecting || liveVoice.isVoiceActive)) {
      setShowVoiceGate(false);
    }
  }, [liveVoice.isConnecting, liveVoice.isVoiceActive, showVoiceGate]);

  const normalizeMessageText = (text: string) =>
    text
      .replace(/\r\n/g, '\n')
      .replace(/\*{2,3}([^*]+?)\*{2,3}/g, '$1');

  // If a voice call is active or connecting, redirect to the VoiceCallView
  if (showVoiceGate || liveVoice.isVoiceActive || liveVoice.isConnecting) {
    return (
      <VoiceCallView
        activeBot={activeBot}
        liveVoice={liveVoice}
        requiredVoiceContactFields={requiredVoiceContactFields}
        onBack={() => {
          liveVoice.stopVoice();
          setShowVoiceGate(false);
        }}
      />
    );
  }

  return (
    <div className={cn("flex-1 bg-brand-bg flex flex-col font-sans", isStandalone ? "w-full min-h-0 overflow-hidden" : "items-center justify-center p-4")}>
      {/* Header Address Bar simulator */}
      <div className={cn("w-full bg-brand-card flex flex-col overflow-hidden", isStandalone ? "flex-1 min-h-0" : "max-w-4xl rounded-2xl border border-brand-border shadow-xl")}>
        
        {/* Fake browser bar */}
        {!isStandalone && (
          <div className="bg-brand-bg px-4 py-3 flex items-center justify-between border-b border-brand-border">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-brand-danger/30 border border-brand-danger"></div>
              <div className="w-3 h-3 rounded-full bg-brand-warning/30 border border-brand-warning"></div>
              <div className="w-3 h-3 rounded-full bg-brand-success/30 border border-brand-success"></div>
            </div>

            <div className="bg-brand-card text-xs text-brand-text/75 px-4 py-1.5 rounded-lg flex items-center justify-center space-x-2 select-all font-mono tracking-wide w-1/2 mx-auto border border-brand-border">
              <Icons.Globe />
              <span className="truncate">AI Receptionist/chats/{activeBot.subDomain}</span>
            </div>

            <div className="flex items-center space-x-2">
              {/* View layout Switcher */}
              <button 
                onClick={() => setPreviewMode(previewMode === 'desktop' ? 'mobile' : 'desktop')}
                className="p-2 hover:bg-brand-bg border border-transparent hover:border-brand-border rounded text-brand-text/70 hover:text-brand-text text-xs font-semibold transition duration-200"
              >
                <span>Simulated: {previewMode === 'desktop' ? 'Desktop' : 'Mobile'}</span>
              </button>
              <button 
                onClick={() => {
                  setView('dashboard');
                  showToast("Returned to Owner Dashboard Console");
                }}
                className="px-3.5 py-1 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border rounded-lg text-xs font-semibold text-brand-text transition duration-200"
              >
                Console
              </button>
            </div>
          </div>
        )}

        {/* Chat Simulator Content Layout */}
        <div className={cn("flex-1 flex flex-col md:flex-row bg-brand-card overflow-hidden", isStandalone ? "min-h-0" : "h-[500px]")}>
          
          {/* Left side widget helper info (Simulating informational landing space of the academy/business) */}
          {((previewMode === 'desktop' && !isStandalone) || isStandalone) && (
            <div className={cn("w-full md:w-80 bg-brand-card border-r border-brand-border p-6 flex flex-col justify-between flex-shrink-0", isStandalone ? "hidden md:flex" : "flex")}>
              <div className="space-y-6">
                <div>
                  <span className="px-2.5 py-1 bg-brand-bg border border-brand-border text-brand-accent rounded-md text-[10px] font-mono uppercase tracking-wider font-semibold">
                    Autonomous Assistant
                  </span>
                  <h3 className="text-xl font-display font-bold mt-4 text-brand-text">{activeBot.businessName}</h3>
                  <p className="text-xs text-brand-text/70 mt-2 leading-relaxed">
                    We are currently open 24/7. Use our interactive chat service on the right to browse programs, schedules, and book slots instantly.
                  </p>
                </div>

              </div>

              <div className="pt-6 border-t border-brand-border text-center font-mono">
                <span className="text-[10px] text-brand-text/60 block uppercase tracking-widest">Powered by Agilewaters.com</span>
              </div>
            </div>
          )}

           {/* Simulated interactive chat viewport */}
           <div className={cn("flex-1 flex flex-col bg-brand-bg overflow-hidden", isStandalone ? "min-h-0" : "h-[500px]", !isStandalone && previewMode === 'mobile' ? 'max-w-md mx-auto border-x border-brand-border rounded-2xl' : '')}>
            
            {/* Chat interface custom banner */}
            <div className="flex-shrink-0 p-4 bg-brand-card border-b border-brand-border text-brand-text flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-brand-bg border border-brand-border rounded-full flex items-center justify-center font-display text-brand-accent font-bold">
                  {activeBot.businessName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold truncate max-w-[200px]">{activeBot.businessName}</h4>
                  <span className="text-[10px] text-brand-success flex items-center font-mono mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-success mr-1.5 animate-ping"></span>
                    <span>Virtual Assistant is online</span>
                  </span>
                </div>
              </div>

            </div>

            {/* Chat message streams */}
            <div
              ref={messagesContainerRef}
              className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 font-sans text-sm bg-brand-bg/50 chat-messages-scroll"
            >
              {chatMessages.map((msg: Message) => {
                const isUser = msg.sender === 'user';
                return (
                  <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl p-3 px-4 border ${isUser ? 'bg-brand-accent border-brand-accent text-brand-text rounded-tr-none' : 'bg-brand-card border-brand-border text-brand-text rounded-tl-none'} shadow-sm`}>
                      <p className="leading-relaxed text-xs md:text-sm whitespace-pre-wrap break-words">
                        {normalizeMessageText(msg.text)}
                      </p>
                      <span className="text-[9px] text-brand-text/55 mt-1 block text-right font-mono">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isBotResponding && (
                <div className="flex justify-start">
                  <div className="bg-brand-card text-brand-text/70 border border-brand-border rounded-xl p-3.5 px-4 rounded-tl-none flex items-center space-x-1.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-brand-accent animate-bounce"></span>
                    <span className="w-2 h-2 rounded-full bg-brand-accent animate-bounce delay-100"></span>
                    <span className="w-2 h-2 rounded-full bg-brand-accent animate-bounce delay-200"></span>
                  </div>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            {/* Simulated Dynamic CRM Leads Sync Banner (Noticeboard) */}
            {!isStandalone && (
              <div className="bg-brand-accent/5 border-y border-brand-border/60 p-2.5 text-center text-xs text-brand-accent font-sans font-semibold">
                Lead details are captured dynamically in the owner console as you converse.
              </div>
            )}

            {/* Input form */}
            <form onSubmit={handleSendChatMessage} className="flex-shrink-0 p-3.5 bg-brand-card border-t border-brand-border flex items-center space-x-2">
              <VoiceInput
                listening={liveVoice.isVoiceActive}
                setListening={(val) => {
                  if (!val) {
                    liveVoice.stopVoice();
                    setShowVoiceGate(false);
                    return;
                  }
                  if (requiredVoiceContactFields.length > 0) {
                    setShowVoiceGate(true);
                    return;
                  }
                  void liveVoice.startVoice();
                }}
                className={liveVoice.isConnecting ? 'opacity-50 pointer-events-none cursor-wait' : ''}
                title={liveVoice.isVoiceActive ? "Stop Voice Call" : "Talk to Agent"}
              />
              
              <input
                type="text"
                value={chatInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChatInput(e.target.value)}
                placeholder={liveVoice.isVoiceActive ? "Voice call active... speak now" : "Type a query... (Try: What is the course curriculum or fees?)"}
                disabled={liveVoice.isVoiceActive}
                maxLength={400}
                className={`flex-1 bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text text-sm focus:outline-none transition font-sans focus:ring-1 focus:ring-brand-accent ${liveVoice.isVoiceActive ? 'opacity-50 cursor-not-allowed' : 'placeholder-brand-muted/70'}`}
              />
              <button
                type="submit"
                disabled={isBotResponding || !chatInput.trim() || liveVoice.isVoiceActive}
                className="p-3.5 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border text-brand-text rounded-lg shadow-md transition disabled:opacity-50"
              >
                <svg className="w-4 h-4 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </form>

          </div>

        </div>

      </div>
    </div>
  );
};
