import React, { useState, useEffect, useRef } from 'react';
import { Bot } from '../../types';
import { Icons } from '../common/Icons';
import { VoicePoweredOrb } from '../ui/voice-powered-orb';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

interface VoiceCallViewProps {
  activeBot: Bot;
  liveVoice: {
    isVoiceActive: boolean;
    isConnecting: boolean;
    liveTranscript: string;
    bookingDetails: any;
    requestedInputType: 'phone' | 'email' | null;
    sendTextData: (text: string) => void;
    startVoice: () => Promise<void>;
    stopVoice: () => void;
  };
  onBack: () => void;
}

export const VoiceCallView: React.FC<VoiceCallViewProps> = ({
  activeBot,
  liveVoice,
  onBack
}) => {
  const [voiceDetected, setVoiceDetected] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const handleSubmitInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    liveVoice.sendTextData(inputValue.trim());
    setInputValue('');
  };

  // Auto-scroll the transcripts to keep the latest bot reply visible
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveVoice.liveTranscript]);

  const getColorHue = (color: string) => {
    const maps: Record<string, number> = {
      indigo: 0,     // Purple/Indigo (Default)
      emerald: 140,  // Green
      rose: 340,     // Red/Pink
      amber: 40,     // Orange/Yellow
    };
    return maps[color] || 0;
  };

  const hue = getColorHue(activeBot.primaryColor);

  return (
    <div className="flex-1 bg-black text-white flex flex-col items-center justify-between p-6 relative overflow-hidden h-screen w-full font-sans select-none">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-accent/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Header bar */}
      <div className="w-full max-w-lg flex items-center justify-between z-10 border-b border-white/5 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-brand-accent/15 border border-brand-accent/30 rounded-full flex items-center justify-center font-display text-brand-accent font-bold text-sm">
            {activeBot.businessName.charAt(0)}
          </div>
          <div>
            <h4 className="text-sm font-display font-bold text-brand-text truncate max-w-[180px]">
              {activeBot.businessName}
            </h4>
            <span className="text-[10px] text-brand-muted font-mono block">
              {activeBot.industry} Assistant
            </span>
          </div>
        </div>

        {/* Live Call Duration / Status */}
        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono">
          <span className={cn(
            "w-2 h-2 rounded-full",
            liveVoice.isConnecting ? "bg-brand-warning animate-pulse" : "bg-brand-success animate-ping"
          )} />
          <span className="text-brand-text/90 tracking-wide uppercase">
            {liveVoice.isConnecting ? "Connecting" : "Voice Live"}
          </span>
        </div>
      </div>

      {/* Center WebGL Orb container */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 my-4 relative w-full max-w-sm">
        <div className={cn(
          "relative flex items-center justify-center transition-all duration-500",
          liveVoice.bookingDetails ? "w-32 h-32 md:w-40 md:h-40" : "w-64 h-64 md:w-80 md:h-80"
        )}>
          <VoicePoweredOrb
            enableVoiceControl={!liveVoice.isConnecting && liveVoice.isVoiceActive}
            className="w-full h-full"
            hue={hue}
            onVoiceDetected={setVoiceDetected}
          />
          {liveVoice.isConnecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-full border border-white/10 animate-pulse">
              <span className="text-sm font-semibold tracking-wider text-brand-accent">INITIALIZING</span>
              <span className="text-[10px] text-brand-muted mt-1 uppercase">Starting stream...</span>
            </div>
          )}
        </div>
        
        {/* Pulsing indicator under the orb */}
        <div className="text-center mt-2 h-6 flex items-center justify-center">
          {!liveVoice.isConnecting && (
            <span className={cn(
              "text-xs font-semibold tracking-widest uppercase transition duration-300 font-mono",
              voiceDetected ? "text-brand-success drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "text-brand-muted"
            )}>
              {voiceDetected ? "Speaking..." : "Listening..."}
            </span>
          )}
        </div>
      </div>

      {/* Booking Success Message */}
      {liveVoice.bookingDetails && (
        <div className="w-full max-w-lg z-10 bg-brand-success/10 border border-brand-success/30 rounded-2xl p-6 flex flex-col items-center justify-center mb-6 shadow-inner relative overflow-hidden backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Icons.CheckCircle className="w-12 h-12 text-brand-success mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">Appointment Confirmed</h3>
          <p className="text-brand-muted text-sm text-center mb-4">
            Booked for {new Date(liveVoice.bookingDetails.startTime).toLocaleDateString()} at {new Date(liveVoice.bookingDetails.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <a
            href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(liveVoice.bookingDetails.title || 'Appointment')}&dates=${new Date(liveVoice.bookingDetails.startTime).toISOString().replace(/-|:|\.\d\d\d/g, '')}/${new Date(liveVoice.bookingDetails.endTime).toISOString().replace(/-|:|\.\d\d\d/g, '')}&details=${encodeURIComponent(`Name: ${liveVoice.bookingDetails.visitorName}\nPhone: ${liveVoice.bookingDetails.visitorPhone}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold py-2 px-6 rounded-full transition-colors flex items-center gap-2"
          >
            <Icons.Calendar className="w-4 h-4" />
            Add to Calendar
          </a>
        </div>
      )}

      {/* Conditional Text Input */}
      {liveVoice.requestedInputType && (
        <div className="w-full max-w-sm z-20 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <form onSubmit={handleSubmitInput} className="bg-brand-card/80 backdrop-blur-md border border-brand-accent/50 rounded-2xl p-4 shadow-2xl flex flex-col items-center">
            <span className="text-sm font-semibold text-white mb-3 tracking-wide">
              Please enter your {liveVoice.requestedInputType}
            </span>
            <div className="flex w-full gap-2">
              <input
                type={liveVoice.requestedInputType === 'email' ? 'email' : 'tel'}
                autoFocus
                className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all"
                placeholder={liveVoice.requestedInputType === 'email' ? 'name@example.com' : '(555) 000-0000'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white rounded-xl px-5 py-3 font-semibold transition-colors flex items-center justify-center"
              >
                <Icons.Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom control buttons */}
      <div className="w-full max-w-lg z-10 flex items-center justify-center pb-6 gap-4">
        <button
          onClick={onBack}
          className="flex flex-col items-center gap-2 group"
          title="End voice session"
        >
          <span className="w-[72px] h-[72px] md:w-20 md:h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 group-hover:shadow-red-500/50 group-hover:scale-105 active:scale-95 transition-all duration-200">
            <svg className="w-9 h-9 text-white -rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
            </svg>
          </span>
          <span className="text-sm font-semibold text-white/70 group-hover:text-white transition-colors">End</span>
        </button>
      </div>
    </div>
  );
};
