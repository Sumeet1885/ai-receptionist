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
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

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
    <div className="flex-1 bg-black text-white flex flex-col items-center justify-between p-6 relative overflow-y-auto h-screen w-full font-sans select-none">
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

      {/* Bottom control buttons */}
      <div className="w-full max-w-lg z-10 flex items-center justify-center pb-4 gap-4">
        {/* End Call Button */}
        <Button
          onClick={onBack}
          variant="destructive"
          className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg hover:shadow-brand-danger/30 hover:scale-105 active:scale-95 transition-all duration-200 border border-brand-danger/30 p-0"
          title="End voice session"
        >
          <Icons.PhoneOff className="w-6 h-6 text-white" />
        </Button>
      </div>
    </div>
  );
};
