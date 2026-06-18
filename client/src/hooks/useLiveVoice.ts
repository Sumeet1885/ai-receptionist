import { useState, useRef, useEffect, useCallback } from 'react';

export function useLiveVoice(botId: string | undefined, sessionId: string | undefined) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [bookingDetails, setBookingDetails] = useState<any>(null);
  const [requestedInputType, setRequestedInputType] = useState<'phone' | 'email' | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  // For playing audio received from server
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const startVoice = useCallback(async () => {
    if (!botId || !sessionId) return;
    
    setLiveTranscript('');
    setIsConnecting(true);
    try {
      // 1. Request microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      } });
      mediaStreamRef.current = stream;

      // 2. Connect to WebSocket proxy on backend
      const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
      const wsUrlBase = expressUrl.replace(/^http/, 'ws');
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const wsUrl = `${wsUrlBase}/api/chat/live?botId=${botId}&sessionId=${sessionId}&timezone=${encodeURIComponent(timezone)}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsVoiceActive(true);

        // 3. Start capturing and sending audio
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContextRef.current.createMediaStreamSource(stream);
        
        // ScriptProcessorNode is used to access raw PCM data
        const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert float32 [-1.0, 1.0] to int16 PCM
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            let s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          // Convert Int16Array to base64
          const bytes = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          ws.send(JSON.stringify({
            type: 'realtimeInput',
            data: base64
          }));
        };

        source.connect(processor);
        processor.connect(audioContextRef.current.destination);
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.type === 'interrupted') {
           // User interrupted the bot. We should stop playing current audio queue.
           if (playbackContextRef.current) {
             playbackContextRef.current.close();
             playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
             nextPlayTimeRef.current = playbackContextRef.current.currentTime;
           }
           return;
        }

        if (msg.type === 'transcript' && msg.text) {
          setLiveTranscript(prev => prev + msg.text);
        }

        if (msg.type === 'request_input' && msg.field) {
          setRequestedInputType(msg.field as 'phone' | 'email');
        }

        if (msg.type === 'appointment_booked' && msg.details) {
          setBookingDetails(msg.details);
        }

        if (msg.type === 'audio' && msg.data) {
          // Base64 to ArrayBuffer
          const binaryString = atob(msg.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // It's 24kHz 16-bit PCM little-endian
          const pcm16 = new Int16Array(bytes.buffer);
          const float32 = new Float32Array(pcm16.length);
          for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 0x8000;
          }
          
          const audioCtx = playbackContextRef.current;
          if (!audioCtx) return;

          const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
          audioBuffer.getChannelData(0).set(float32);

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);

          const startTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
          source.start(startTime);
          nextPlayTimeRef.current = startTime + audioBuffer.duration;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
        stopVoice();
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
        stopVoice();
      };

    } catch (err) {
      console.error('Error starting voice:', err);
      setIsConnecting(false);
      stopVoice();
    }
  }, [botId, sessionId]);

  const stopVoice = useCallback(() => {
    setIsVoiceActive(false);
    setIsConnecting(false);
    setBookingDetails(null);
    setRequestedInputType(null);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, [stopVoice]);

  const sendTextData = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'textInput',
        data: text
      }));
      setRequestedInputType(null);
    }
  }, []);

  return {
    isVoiceActive,
    isConnecting,
    liveTranscript,
    setLiveTranscript,
    bookingDetails,
    requestedInputType,
    sendTextData,
    startVoice,
    stopVoice
  };
}
