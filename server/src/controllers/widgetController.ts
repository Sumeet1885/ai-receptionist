import { Request, Response } from 'express';
import { supabase } from '../services/db';
import { config } from '../config';
import { buildFrameAncestors, checkAllowedOrigin } from '../utils/security';
import { defaultWidgetConfig, escapeHtml, mergeWidgetConfig } from '../utils/widgetConfig';

const CONFIGURED_BASE_URL = process.env.WIDGET_BASE_URL || process.env.EXPRESS_SERVER_URL || '';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getRequestBaseUrl(req: Request): string {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host');

  if (!host) {
    return `http://localhost:${process.env.PORT || 4000}`;
  }

  return `${protocol}://${host}`;
}

function getWidgetRuntimeBaseUrl(req: Request): string {
  return trimTrailingSlash(CONFIGURED_BASE_URL || getRequestBaseUrl(req));
}

/**
 * GET /widget/loader.js
 * Serves the universal embed loader script.
 * The customer pastes: <script src="https://domain/widget/loader.js" data-bot-id="UUID"></script>
 */
export const serveLoader = (req: Request, res: Response) => {
  const baseUrl = getWidgetRuntimeBaseUrl(req);

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');

  const js = `(function(){
  if (window.__aiReceptionistLoaded) return;
  window.__aiReceptionistLoaded = true;

  var script = document.currentScript || (function(){
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('/widget/loader.js') !== -1) return scripts[i];
    }
    return null;
  })();

  var botId = script ? script.getAttribute('data-bot-id') : null;
  if (!botId) {
    console.error('[AI Receptionist] Missing data-bot-id on script tag.');
    return;
  }

  var baseUrl = ${JSON.stringify(baseUrl)};
  var config = ${JSON.stringify(defaultWidgetConfig)};
  var isOpen = false;
  var iframe = null;
  var style = document.createElement('style');
  var bubble = document.createElement('button');
  var container = document.createElement('div');

  function escapeText(value) {
    return String(value || '').replace(/[&<>"']/g, function(match) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[match];
    });
  }

  function cleanHex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
  }

  function mergeConfig(next) {
    next = next || {};
    config = Object.assign({}, config, next);
    config.primaryColor = cleanHex(config.primaryColor, '#22e6a8');
    config.launcherPosition = config.launcherPosition === 'bottom-left' ? 'bottom-left' : 'bottom-right';
    config.launcherStyle = config.launcherStyle === 'text' ? 'text' : 'icon';
    config.launcherText = String(config.launcherText || 'Chat').slice(0, 24);
    config.widgetSize = ['compact', 'standard', 'large'].indexOf(config.widgetSize) >= 0 ? config.widgetSize : 'standard';
    config.radius = ['sharp', 'soft', 'rounded'].indexOf(config.radius) >= 0 ? config.radius : 'soft';
  }

  function chatSvg() {
    return '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';
  }

  function closeSvg() {
    return '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  }

  function renderBubble() {
    if (isOpen) {
      bubble.innerHTML = closeSvg();
      return;
    }
    bubble.innerHTML = config.launcherStyle === 'text'
      ? '<span>' + escapeText(config.launcherText || 'Chat') + '</span>'
      : chatSvg();
  }

  function renderStyle() {
    var left = config.launcherPosition === 'bottom-left';
    var width = config.widgetSize === 'compact' ? '340px' : config.widgetSize === 'large' ? '460px' : '400px';
    var height = config.widgetSize === 'compact' ? '500px' : config.widgetSize === 'large' ? '640px' : '560px';
    var radius = config.radius === 'sharp' ? '6px' : config.radius === 'rounded' ? '24px' : '16px';
    var bubbleSize = config.launcherStyle === 'text' ? 'auto' : '60px';
    var bubblePadding = config.launcherStyle === 'text' ? '0 18px' : '0';
    var sideRule = left ? 'left:24px;right:auto;' : 'right:24px;left:auto;';
    var mobileSideRule = left ? 'left:16px;right:auto;' : 'right:16px;left:auto;';
    style.textContent =
      '#air-widget-bubble{position:fixed;bottom:24px;' + sideRule + 'z-index:2147483647;min-width:60px;width:' + bubbleSize + ';height:60px;padding:' + bubblePadding + ';border-radius:999px;background:' + config.primaryColor + ';border:none;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.24);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;color:#07130f;font:700 14px Arial,sans-serif}' +
      '#air-widget-bubble:hover{transform:scale(1.06);box-shadow:0 12px 36px rgba(0,0,0,.28)}#air-widget-bubble svg{width:26px;height:26px;fill:currentColor}#air-widget-bubble span{white-space:nowrap}' +
      '#air-widget-container{position:fixed;bottom:96px;' + sideRule + 'z-index:2147483647;width:' + width + ';height:' + height + ';max-width:calc(100vw - 32px);max-height:calc(100vh - 120px);border-radius:' + radius + ';overflow:hidden;box-shadow:0 14px 44px rgba(0,0,0,.28);transition:opacity .25s ease,transform .25s ease;opacity:0;transform:translateY(16px) scale(.96);pointer-events:none}' +
      '#air-widget-container.air-open{opacity:1;transform:translateY(0) scale(1);pointer-events:all}#air-widget-container iframe{width:100%;height:100%;border:none;border-radius:' + radius + '}' +
      '@media(max-width:480px){#air-widget-container{width:calc(100vw - 16px);height:calc(100vh - 80px);bottom:8px;right:8px;left:8px;border-radius:12px}#air-widget-bubble{bottom:16px;' + mobileSideRule + 'height:52px;min-width:52px}}';
  }

  function applyConfig(next) {
    mergeConfig(next);
    renderStyle();
    renderBubble();
  }

  document.head.appendChild(style);
  bubble.id = 'air-widget-bubble';
  bubble.setAttribute('aria-label', 'Open chat');
  container.id = 'air-widget-container';
  document.body.appendChild(bubble);
  document.body.appendChild(container);
  applyConfig(config);

  bubble.addEventListener('click', function() {
    isOpen = !isOpen;
    if (isOpen) {
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.src = baseUrl + '/widget/' + encodeURIComponent(botId);
        iframe.setAttribute('allow', 'microphone');
        iframe.setAttribute('title', 'AI Receptionist Chat');
        container.appendChild(iframe);
      }
      container.classList.add('air-open');
    } else {
      container.classList.remove('air-open');
    }
    renderBubble();
  });

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'air-widget-close') {
      isOpen = false;
      container.classList.remove('air-open');
      renderBubble();
    }
  });

  fetch(baseUrl + '/api/chat/bot/' + encodeURIComponent(botId), { method: 'GET' })
    .then(function(response) { return response.ok ? response.json() : null; })
    .then(function(data) { if (data && data.widget_config) applyConfig(data.widget_config); })
    .catch(function() {});
})();`;

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
    .select('*')
    .eq('id', botId)
    .eq('is_active', true)
    .single();

  if (error || !bot) {
    res.status(404).send('<html><body><p>Widget not found.</p></body></html>');
    return;
  }

  const originCheck = checkAllowedOrigin(req, {
    allowedDomains: bot.allowed_domains || [],
    extraAllowedOrigins: [config.clientUrl],
    allowRuntimeOrigin: false,
    requireSource: true,
  });

  if (!originCheck.allowed) {
    res.status(403).send(`<html><body><p>Access Denied. ${originCheck.reason || 'Origin is not authorized for this widget.'}</p></body></html>`);
    return;
  }

  const apiBase = getWidgetRuntimeBaseUrl(req);
  const widgetConfig = mergeWidgetConfig(bot.widget_config, bot);
  const displayName = escapeHtml(widgetConfig.assistantName || bot.business_name);
  const avatarText = escapeHtml(widgetConfig.avatarText || bot.business_name.charAt(0));
  const radiusPx = widgetConfig.radius === 'sharp' ? '6px' : widgetConfig.radius === 'rounded' ? '24px' : '16px';
  const promptButtons = widgetConfig.suggestedPrompts.map((prompt, index) => (
    `<button type="button" class="suggestion-btn" data-prompt-index="${index}">${escapeHtml(prompt)}</button>`
  )).join('');
  const voiceButtonHtml = widgetConfig.enableVoice ? `
  <button type="button" id="voiceBtn" class="voice-btn" title="Talk to agent" aria-label="Talk to agent">
    <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
  </button>` : '';
  const poweredByHtml = widgetConfig.showPoweredBy
    ? `<div class="powered-by">Powered by <a href="https://agilewaters.com" target="_blank" rel="noopener">Agilewaters.com</a></div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${displayName} - Chat</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: ${widgetConfig.backgroundColor};
    --card: ${widgetConfig.surfaceColor};
    --border: ${widgetConfig.primaryColor}33;
    --text: ${widgetConfig.textColor};
    --muted: #6b7280;
    --accent: ${widgetConfig.primaryColor};
    --accent-hover: ${widgetConfig.primaryColor};
    --success: #22c55e;
    --radius: ${radiusPx};
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
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
    background: var(--accent); border: 1px solid var(--accent);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: var(--bg); font-size: 14px;
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
    color: var(--bg);
    border-top-right-radius: 4px;
  }
  .msg-time { font-size: 9px; color: var(--muted); margin-top: 4px; text-align: right; }

  .typing { display: flex; gap: 4px; padding: 12px 14px; align-self: flex-start; }
  .typing span {
    width: 7px; height: 7px; border-radius: 50%; background: var(--accent);
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .suggestions {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: -2px;
  }
  .suggestion-btn {
    background: transparent; border: 1px solid var(--border); color: var(--accent);
    border-radius: 999px; padding: 7px 10px; font-size: 11px; cursor: pointer;
  }
  .suggestion-btn:hover { background: var(--card); }
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
    color: var(--bg); cursor: pointer; padding: 10px 14px;
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

  /* Voice call overlay styles matching AIVoiceInput */
  .voice-overlay {
    position: absolute;
    top: 65px;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg);
    opacity: 0.98;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .voice-overlay-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    max-width: 320px;
    padding: 24px;
    text-align: center;
  }
  .overlay-mic-btn {
    width: 64px;
    height: 64px;
    border-radius: 12px;
    background: none;
    border: none;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
    outline: none;
  }
  .overlay-mic-btn:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .overlay-mic-btn svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
    color: var(--text);
    opacity: 0.7;
  }
  .overlay-mic-btn .stop-icon {
    width: 24px;
    height: 24px;
    background: var(--text);
    border-radius: 4px;
    animation: spin 3s linear infinite;
  }
  .voice-timer {
    font-family: monospace;
    font-size: 14px;
    color: var(--text);
    opacity: 0.7;
    transition: opacity 0.3s;
  }
  .visualizer {
    height: 16px;
    width: 256px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .visualizer-bar {
    width: 2px;
    height: 4px;
    background: var(--text);
    border-radius: 99px;
    opacity: 0.1;
    transition: all 0.3s ease;
  }
  .visualizer.active .visualizer-bar {
    opacity: 0.5;
    animation: bounceBar 1.2s infinite ease-in-out;
  }
  @keyframes bounceBar {
    0%, 100% { height: 4px; }
    50% { height: calc(4px + 12px * var(--height-multiplier, 1)); }
  }
  .voice-status {
    font-size: 12px;
    color: var(--text);
    opacity: 0.7;
    height: 16px;
  }
  .end-call-btn {
    margin-top: 12px;
    padding: 10px 24px;
    border-radius: 99px;
    background: #ef4444;
    color: #fff;
    border: none;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
  }
  .end-call-btn:hover {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.3);
  }

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
    <div class="widget-avatar">${avatarText}</div>
    <div class="widget-header-info">
      <h4>${displayName}</h4>
      <span><span class="dot"></span> Online</span>
    </div>
  </div>
  <button class="close-btn" onclick="window.parent.postMessage({type:'air-widget-close'},'*')" title="Close">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
  </button>
</div>

<div class="messages" id="messages"></div>

<!-- Voice Input Overlay Component (AIVoiceInput representation) -->
<div id="voiceOverlay" class="voice-overlay" style="display: none;">
  <div class="voice-overlay-content">
    <button type="button" id="overlayMicBtn" class="overlay-mic-btn" title="End voice call">
      <div id="overlayMicIcon" style="display: none;">
        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
      </div>
      <div id="overlayStopIcon" class="stop-icon"></div>
    </button>
    
    <span id="voiceTimer" class="voice-timer">00:00</span>
    
    <div id="visualizer" class="visualizer"></div>
    
    <p id="voiceStatus" class="voice-status">Listening...</p>
    
    <button type="button" id="endCallBtn" class="end-call-btn">End Call</button>
  </div>
</div>

<form class="input-area" id="chatForm">
  ${voiceButtonHtml}
  <input type="text" id="chatInput" placeholder="${escapeHtml(widgetConfig.inputPlaceholder)}" autocomplete="off" />
  <button type="submit" id="sendBtn">
    <svg viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
  </button>
</form>

${poweredByHtml}

<script>
(function() {
  var API = '${apiBase}';
  var BOT_ID = '${bot.id}';
  var GREETING = ${JSON.stringify(bot.greeting)};
  var SUGGESTED_PROMPTS = ${JSON.stringify(widgetConfig.suggestedPrompts)};
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

  var voiceOverlay = document.getElementById('voiceOverlay');
  var overlayMicBtn = document.getElementById('overlayMicBtn');
  var overlayMicIcon = document.getElementById('overlayMicIcon');
  var overlayStopIcon = document.getElementById('overlayStopIcon');
  var voiceTimer = document.getElementById('voiceTimer');
  var visualizer = document.getElementById('visualizer');
  var voiceStatus = document.getElementById('voiceStatus');
  var endCallBtn = document.getElementById('endCallBtn');
  var timerInterval = null;
  var secondsElapsed = 0;

  function formatTimer(sec) {
    var mins = Math.floor(sec / 60);
    var secs = sec % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function startTimer() {
    stopTimer();
    secondsElapsed = 0;
    voiceTimer.textContent = '00:00';
    timerInterval = setInterval(function() {
      secondsElapsed++;
      voiceTimer.textContent = formatTimer(secondsElapsed);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function initVisualizer() {
    if (!visualizer) return;
    visualizer.innerHTML = '';
    for (var i = 0; i < 48; i++) {
      var bar = document.createElement('div');
      bar.className = 'visualizer-bar';
      bar.style.animationDelay = (i * 0.05) + 's';
      bar.style.setProperty('--height-multiplier', (1 + Math.random() * 2));
      visualizer.appendChild(bar);
    }
  }

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

  function renderSuggestions() {
    if (!SUGGESTED_PROMPTS.length) return;
    var existing = document.getElementById('suggestions');
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.id = 'suggestions';
    wrap.className = 'suggestions';
    wrap.innerHTML = ${JSON.stringify(promptButtons)};
    messagesEl.appendChild(wrap);
    Array.prototype.forEach.call(wrap.querySelectorAll('.suggestion-btn'), function(button) {
      button.addEventListener('click', function() {
        chatInput.value = SUGGESTED_PROMPTS[Number(button.getAttribute('data-prompt-index'))] || button.textContent || '';
        chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideTyping() {
    var t = document.getElementById('typing-indicator');
    if (t) t.remove();
  }

  function setVoiceState(state) {
    if (!voiceBtn) return;
    voiceBtn.classList.remove('active', 'connecting');
    voiceBtn.disabled = !sessionId || state === 'connecting';
    if (state === 'connecting') {
      voiceBtn.classList.add('connecting');
      voiceBtn.title = 'Connecting...';
      
      if (voiceOverlay) {
        voiceOverlay.style.display = 'flex';
        overlayMicIcon.style.display = 'none';
        overlayStopIcon.style.display = 'block';
        visualizer.classList.remove('active');
        voiceStatus.textContent = 'Connecting...';
        startTimer();
      }
    } else if (state === 'active') {
      voiceBtn.classList.add('active');
      voiceBtn.title = 'End voice call';
      
      if (voiceOverlay) {
        voiceOverlay.style.display = 'flex';
        overlayMicIcon.style.display = 'none';
        overlayStopIcon.style.display = 'block';
        visualizer.classList.add('active');
        voiceStatus.textContent = 'Listening...';
      }
    } else {
      voiceBtn.title = 'Talk to agent';
      
      if (voiceOverlay) {
        voiceOverlay.style.display = 'none';
        stopTimer();
      }
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
    if (!voiceBtn || !sessionId || isVoiceActive) return;
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
      renderSuggestions();
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
      if (data && typeof data.reply === 'string' && data.reply.trim()) {
        addMessage(data.reply, 'bot');
      } else if (!res.ok) {
        addMessage(data.error || 'Sorry, I could not process that request right now.', 'bot');
      } else {
        addMessage('I need a moment to confirm that. Please tell me your preferred date and time again.', 'bot');
      }
    } catch (err) {
      hideTyping();
      addMessage('Sorry, I\\'m having trouble connecting right now.', 'bot');
    } finally {
      isResponding = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  });

  if (voiceBtn) {
    voiceBtn.addEventListener('click', function() {
      if (isVoiceActive) stopVoice();
      else startVoice();
    });
  }

  if (overlayMicBtn) {
    overlayMicBtn.addEventListener('click', function() {
      if (isVoiceActive) stopVoice();
    });
  }

  if (endCallBtn) {
    endCallBtn.addEventListener('click', function() {
      stopVoice();
    });
  }

  setVoiceState('idle');
  initVisualizer();
  initSession();
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-cache');
  
  const frameAncestors = buildFrameAncestors(bot.allowed_domains || [], [config.clientUrl]);
  res.setHeader('Content-Security-Policy', frameAncestors ? `frame-ancestors ${frameAncestors}` : "frame-ancestors 'none'");
  
  res.removeHeader('X-Frame-Options');
  res.send(html);
};
