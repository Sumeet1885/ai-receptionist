import { Request, Response } from 'express';
import { supabase } from '../services/db';

const BASE_URL = process.env.WIDGET_BASE_URL || process.env.EXPRESS_SERVER_URL || `http://localhost:${process.env.PORT || 4000}`;

/**
 * GET /widget/loader.js
 * Serves the universal embed loader script.
 * The customer pastes: <script src="https://domain/widget/loader.js" data-bot-id="UUID"></script>
 */
export const serveLoader = (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  // Minified loader script
  const js = `!function(){if(!window.__aiReceptionistLoaded){window.__aiReceptionistLoaded=!0;var e=document.currentScript||function(){for(var e=document.getElementsByTagName("script"),t=e.length-1;t>=0;t--)if(e[t].src&&-1!==e[t].src.indexOf("/widget/loader.js"))return e[t];return null}();var t=e?e.getAttribute("data-bot-id"):null;if(t){var n="${BASE_URL}",i=!1,o=document.createElement("style");o.textContent="#air-widget-bubble{position:fixed;bottom:24px;right:24px;z-index:2147483647;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;cursor:pointer;box-shadow:0 4px 24px rgba(99,102,241,.4);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease}#air-widget-bubble:hover{transform:scale(1.1);box-shadow:0 6px 32px rgba(99,102,241,.55)}#air-widget-bubble svg{width:28px;height:28px;fill:#fff}#air-widget-container{position:fixed;bottom:96px;right:24px;z-index:2147483647;width:400px;height:560px;max-width:calc(100vw - 32px);max-height:calc(100vh - 120px);border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.25);transition:opacity .25s ease,transform .25s ease;opacity:0;transform:translateY(16px) scale(.95);pointer-events:none}#air-widget-container.air-open{opacity:1;transform:translateY(0) scale(1);pointer-events:all}#air-widget-container iframe{width:100%;height:100%;border:none;border-radius:16px}@media(max-width:480px){#air-widget-container{width:calc(100vw - 16px);height:calc(100vh - 80px);bottom:8px;right:8px;border-radius:12px}#air-widget-bubble{bottom:16px;right:16px;width:52px;height:52px}}",document.head.appendChild(o);var r=document.createElement("button");r.id="air-widget-bubble",r.setAttribute("aria-label","Open chat"),r.innerHTML='<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>',document.body.appendChild(r);var d,a=document.createElement("div");a.id="air-widget-container",document.body.appendChild(a),r.addEventListener("click",(function(){(i=!i)?(d||((d=document.createElement("iframe")).src=n+"/widget/"+t,d.setAttribute("allow","microphone"),d.setAttribute("title","AI Receptionist Chat"),a.appendChild(d)),a.classList.add("air-open"),r.innerHTML='<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'):(a.classList.remove("air-open"),r.innerHTML='<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>')})),window.addEventListener("message",(function(e){e.data&&"air-widget-close"===e.data.type&&(i=!1,a.classList.remove("air-open"),r.innerHTML='<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>')}))}else console.error("[AI Receptionist] Missing data-bot-id on script tag.")}}();`;

  res.send(js);
};


/**
 * GET /widget/:botId
 * Serves the self-contained chat widget HTML page (loaded in an iframe).
 */
export const serveWidgetPage = async (req: Request, res: Response) => {
  const { botId } = req.params;

  // Validate bot exists and get allowed domains
  const { data: bot, error } = await supabase
    .from('bots')
    // We intentionally don't throw if allowed_domains doesn't exist yet via RPC,
    // but standard REST select works if schema is updated.
    .select('id, business_name, greeting, primary_color, languages, industry, knowledge_base, allowed_domains')
    .eq('id', botId)
    .eq('is_active', true)
    .single();

  if (error || !bot) {
    res.status(404).send('<html><body><p>Widget not found.</p></body></html>');
    return;
  }

  // Strict CORS check: If allowed_domains is empty, reject entirely
  const origin = req.get('Referer') || req.get('Origin');
  if (!bot.allowed_domains || bot.allowed_domains.length === 0) {
    res.status(403).send('<html><body><p>Widget is disabled. No allowed domains configured.</p></body></html>');
    return;
  }

  if (!origin) {
    res.status(403).send('<html><body><p>Access Denied (Missing Origin)</p></body></html>');
    return;
  }

  const originUrl = new URL(origin).origin;
  const isAllowed = bot.allowed_domains.some((domain: string) => {
    try { return new URL(domain).origin === originUrl; } catch { return false; }
  });
  
  if (!isAllowed) {
    res.status(403).send(`<html><body><p>Access Denied. Origin ${originUrl} is not authorized for this widget.</p></body></html>`);
    return;
  }

  const apiBase = BASE_URL;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${bot.business_name} - Chat</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f1117;
    --card: #181a20;
    --border: #23262f;
    --text: #e6e8ec;
    --muted: #6b7280;
    --accent: #6366f1;
    --accent-hover: #818cf8;
    --success: #22c55e;
  }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .widget-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .widget-header-left { display: flex; align-items: center; gap: 10px; }
  .widget-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--bg); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: var(--accent); font-size: 14px;
  }
  .widget-header-info h4 { font-size: 13px; font-weight: 600; }
  .widget-header-info span {
    font-size: 10px; color: var(--success);
    display: flex; align-items: center; gap: 4px;
  }
  .widget-header-info .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--success); animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  .close-btn {
    background: none; border: 1px solid var(--border); border-radius: 8px;
    color: var(--muted); cursor: pointer; padding: 6px 8px;
    transition: all 0.2s;
  }
  .close-btn:hover { color: var(--text); background: var(--bg); }

  /* Messages Area */
  .messages {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .messages::-webkit-scrollbar { width: 4px; }
  .messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .msg { max-width: 85%; padding: 10px 14px; border-radius: 14px; font-size: 13px; line-height: 1.5; }
  .msg-bot {
    align-self: flex-start;
    background: var(--card); border: 1px solid var(--border);
    border-top-left-radius: 4px;
  }
  .msg-user {
    align-self: flex-end;
    background: var(--accent); border: 1px solid var(--accent);
    border-top-right-radius: 4px;
  }
  .msg-time { font-size: 9px; color: var(--muted); margin-top: 4px; text-align: right; }

  .typing { display: flex; gap: 4px; padding: 12px 14px; align-self: flex-start; }
  .typing span {
    width: 7px; height: 7px; border-radius: 50%; background: var(--accent);
    animation: bounce 1.4s infinite ease-in-out both;
  }
  .typing span:nth-child(2) { animation-delay: 0.16s; }
  .typing span:nth-child(3) { animation-delay: 0.32s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  /* Input Area */
  .input-area {
    flex-shrink: 0; padding: 12px; background: var(--card);
    border-top: 1px solid var(--border);
    display: flex; gap: 8px;
  }
  .input-area input {
    flex: 1; background: var(--bg); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 14px; color: var(--text);
    font-size: 13px; font-family: inherit; outline: none;
    transition: border-color 0.2s;
  }
  .input-area input::placeholder { color: var(--muted); }
  .input-area input:focus { border-color: var(--accent); }
  .input-area button {
    background: var(--accent); border: none; border-radius: 10px;
    color: #fff; cursor: pointer; padding: 10px 14px;
    transition: background 0.2s;
  }
  .input-area .voice-btn {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .input-area .voice-btn.active {
    background: var(--success);
    border-color: var(--success);
    color: #06130b;
  }
  .input-area .voice-btn.connecting {
    color: var(--accent);
    border-color: var(--accent);
  }
  .input-area button:hover { background: var(--accent-hover); }
  .input-area .voice-btn:hover { background: var(--card); color: var(--text); }
  .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
  .input-area button svg { width: 16px; height: 16px; fill: currentColor; }

  /* Powered By */
  .powered-by {
    text-align: center; padding: 6px; font-size: 9px;
    color: var(--muted); background: var(--card);
    border-top: 1px solid var(--border); flex-shrink: 0;
  }
  .powered-by a { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>

<div class="widget-header">
  <div class="widget-header-left">
    <div class="widget-avatar">${bot.business_name.charAt(0)}</div>
    <div class="widget-header-info">
      <h4>${bot.business_name}</h4>
      <span><span class="dot"></span> Online</span>
    </div>
  </div>
  <button class="close-btn" onclick="window.parent.postMessage({type:'air-widget-close'},'*')" title="Close">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
  </button>
</div>

<div class="messages" id="messages"></div>

<form class="input-area" id="chatForm">
  <button type="button" id="voiceBtn" class="voice-btn" title="Talk to agent" aria-label="Talk to agent">
    <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
  </button>
  <input type="text" id="chatInput" placeholder="Type a message..." autocomplete="off" />
  <button type="submit" id="sendBtn">
    <svg viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
  </button>
</form>

<div class="powered-by">Powered by <a href="https://agilewaters.com" target="_blank" rel="noopener">Agilewaters.com</a></div>

<script>
(function() {
  var API = '${apiBase}';
  var BOT_ID = '${bot.id}';
  var GREETING = ${JSON.stringify(bot.greeting)};
  var sessionId = null;
  var isResponding = false;

  var messagesEl = document.getElementById('messages');
  var chatInput = document.getElementById('chatInput');
  var chatForm = document.getElementById('chatForm');
  var sendBtn = document.getElementById('sendBtn');
  var voiceBtn = document.getElementById('voiceBtn');
  var timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  var ws = null;
  var audioContext = null;
  var mediaStream = null;
  var processor = null;
  var playbackContext = null;
  var nextPlayTime = 0;
  var isVoiceActive = false;

  function timeStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function addMessage(text, sender) {
    var div = document.createElement('div');
    div.className = 'msg msg-' + sender;
    div.innerHTML = '<div>' + escapeHtml(text) + '</div><div class="msg-time">' + timeStr() + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showTyping() {
    var t = document.createElement('div');
    t.className = 'typing';
    t.id = 'typing-indicator';
    t.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(t);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    var t = document.getElementById('typing-indicator');
    if (t) t.remove();
  }

  function setVoiceState(state) {
    voiceBtn.classList.remove('active', 'connecting');
    voiceBtn.disabled = !sessionId || state === 'connecting';
    if (state === 'connecting') {
      voiceBtn.classList.add('connecting');
      voiceBtn.title = 'Connecting...';
    } else if (state === 'active') {
      voiceBtn.classList.add('active');
      voiceBtn.title = 'End voice call';
    } else {
      voiceBtn.title = 'Talk to agent';
    }
  }

  function stopVoice() {
    isVoiceActive = false;
    if (ws) {
      var socket = ws;
      ws = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
    if (processor) {
      processor.disconnect();
      processor = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (playbackContext) {
      playbackContext.close();
      playbackContext = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(track) { track.stop(); });
      mediaStream = null;
    }
    chatInput.disabled = false;
    setVoiceState('idle');
  }

  async function startVoice() {
    if (!sessionId || isVoiceActive) return;
    setVoiceState('connecting');
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      var wsBase = API.replace(/^http/, 'ws');
      ws = new WebSocket(wsBase + '/api/chat/live?botId=' + encodeURIComponent(BOT_ID) + '&sessionId=' + encodeURIComponent(sessionId) + '&timezone=' + encodeURIComponent(timezone));
      playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      nextPlayTime = playbackContext.currentTime;

      ws.onopen = function() {
        isVoiceActive = true;
        chatInput.disabled = true;
        setVoiceState('active');
        addMessage('Voice call started. Speak now.', 'bot');

        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        var source = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = function(event) {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          var inputData = event.inputBuffer.getChannelData(0);
          var pcm16 = new Int16Array(inputData.length);
          for (var i = 0; i < inputData.length; i++) {
            var s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          var bytes = new Uint8Array(pcm16.buffer);
          var binary = '';
          for (var j = 0; j < bytes.byteLength; j++) binary += String.fromCharCode(bytes[j]);
          ws.send(JSON.stringify({ type: 'realtimeInput', data: btoa(binary) }));
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = function(event) {
        var msg = JSON.parse(event.data);
        if (msg.type === 'interrupted') {
          if (playbackContext) {
            playbackContext.close();
            playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            nextPlayTime = playbackContext.currentTime;
          }
          return;
        }
        if (msg.type === 'transcript' && msg.text) {
          addMessage(msg.text, 'bot');
        }
        if (msg.type === 'appointment_booked' && msg.details) {
          addMessage('Appointment confirmed for ' + new Date(msg.details.startTime).toLocaleString() + '.', 'bot');
        }
        if (msg.type === 'audio' && msg.data && playbackContext) {
          var binaryString = atob(msg.data);
          var bytes = new Uint8Array(binaryString.length);
          for (var i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          var pcm16 = new Int16Array(bytes.buffer);
          var float32 = new Float32Array(pcm16.length);
          for (var j = 0; j < pcm16.length; j++) float32[j] = pcm16[j] / 0x8000;
          var audioBuffer = playbackContext.createBuffer(1, float32.length, 24000);
          audioBuffer.getChannelData(0).set(float32);
          var source = playbackContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(playbackContext.destination);
          var startTime = Math.max(playbackContext.currentTime, nextPlayTime);
          source.start(startTime);
          nextPlayTime = startTime + audioBuffer.duration;
        }
      };

      ws.onerror = function() {
        addMessage('Voice connection failed. Please try again.', 'bot');
        stopVoice();
      };
      ws.onclose = function() {
        if (isVoiceActive) addMessage('Voice call ended.', 'bot');
        stopVoice();
      };
    } catch (err) {
      console.error('[AI Receptionist Widget] Voice error:', err);
      addMessage('Microphone access failed. Please allow microphone permission and try again.', 'bot');
      stopVoice();
    }
  }

  // Create session
  async function initSession() {
    try {
      var visitorId = localStorage.getItem('air_visitor_id');
      if (!visitorId) {
        visitorId = 'widget-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('air_visitor_id', visitorId);
      }

      var res = await fetch(API + '/api/chat/bot/' + BOT_ID, { method: 'GET' });
      if (!res.ok) throw new Error('Bot fetch failed');
      var botData = await res.json();

      // Create session via the session endpoint
      var sessRes = await fetch(API + '/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: BOT_ID, visitorId: visitorId })
      });
      var sessData = await sessRes.json();
      sessionId = sessData.sessionId;
      setVoiceState('idle');

      addMessage(GREETING, 'bot');
    } catch (err) {
      console.error('[AI Receptionist Widget] Init error:', err);
      addMessage('Welcome! Please try refreshing if the connection fails.', 'bot');
    }
  }

  chatForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var text = chatInput.value.trim();
    if (!text || !sessionId || isResponding) return;

    addMessage(text, 'user');
    chatInput.value = '';
    isResponding = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      var res = await fetch(API + '/api/chat/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, userMessage: text, timezone: timezone })
      });
      var data = await res.json();
      hideTyping();
      addMessage(data.reply || 'Thank you for your message.', 'bot');
    } catch (err) {
      hideTyping();
      addMessage('Sorry, I\\'m having trouble connecting right now.', 'bot');
    } finally {
      isResponding = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  });

  voiceBtn.addEventListener('click', function() {
    if (isVoiceActive) stopVoice();
    else startVoice();
  });

  setVoiceState('idle');

  initSession();
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'public, s-maxage=3600'); // Edge cache HTML response
  
  if (bot.allowed_domains && bot.allowed_domains.length > 0) {
    const ancestors = bot.allowed_domains.map((d:string) => {
      try { return new URL(d).origin; } catch { return ''; }
    }).filter(Boolean).join(' ');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ancestors}`);
  } else {
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
  }
  
  res.removeHeader('X-Frame-Options');
  res.send(html);
};
