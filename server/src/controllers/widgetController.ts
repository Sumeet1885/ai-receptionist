import { Request, Response } from 'express';
import { supabase } from '../services/db';
import { config } from '../config';
import { buildFrameAncestors, checkAllowedOrigin } from '../utils/security';
import { defaultWidgetConfig, escapeHtml, getContrastingTextColor, mergeWidgetConfig } from '../utils/widgetConfig';

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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

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
  var mounted = false;
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

  function contrastColor(hex) {
    var value = cleanHex(hex, '#000000').slice(1);
    var channels = [0, 2, 4].map(function(index) {
      var channel = parseInt(value.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    var luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    var whiteContrast = 1.05 / (luminance + 0.05);
    var darkContrast = (luminance + 0.05) / 0.057;
    return whiteContrast >= darkContrast ? '#FFFFFF' : '#111827';
  }

  function mergeConfig(next) {
    next = next || {};
    config = Object.assign({}, config, next);
    config.primaryColor = cleanHex(config.primaryColor, '#5B8CFF');
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
      '#air-widget-bubble{position:fixed;bottom:24px;' + sideRule + 'z-index:2147483647;min-width:60px;width:' + bubbleSize + ';height:60px;padding:' + bubblePadding + ';border-radius:999px;background:' + config.primaryColor + ';border:none;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.24);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,box-shadow .2s ease;color:' + contrastColor(config.primaryColor) + ';font:700 14px Arial,sans-serif}' +
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

  function mountWidget() {
    if (mounted) return;
    mounted = true;

    document.head.appendChild(style);
    bubble.id = 'air-widget-bubble';
    bubble.setAttribute('aria-label', 'Open chat');
    container.id = 'air-widget-container';
    document.body.appendChild(bubble);
    document.body.appendChild(container);

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
  }

  fetch(baseUrl + '/api/chat/bot/' + encodeURIComponent(botId), { method: 'GET' })
    .then(function(response) { return response.ok ? response.json() : null; })
    .then(function(data) {
      if (!data || !data.widget_config) return;
      mountWidget();
      applyConfig(data.widget_config);
    })
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
  const onAccentColor = getContrastingTextColor(widgetConfig.primaryColor);
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
    --muted: ${widgetConfig.textColor}99;
    --accent: ${widgetConfig.primaryColor};
    --accent-hover: ${widgetConfig.primaryColor};
    --on-accent: ${onAccentColor};
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
    font-weight: 700; color: var(--on-accent); font-size: 14px;
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
    color: var(--on-accent);
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
    color: var(--on-accent); cursor: pointer; padding: 10px 14px;
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
    flex-direction: column;
    align-items: center;
    overflow-y: auto;
    padding: 16px 0;
    animation: fadeIn 0.3s ease;
  }
  .voice-overlay::-webkit-scrollbar { width: 4px; }
  .voice-overlay::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
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
    padding: 0 24px;
    text-align: center;
    margin: auto 0;
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


  /* Voice Input Box */
  .voice-input-container {
    display: none; flex-direction: column; width: 100%; margin-top: 16px;
    background: transparent; padding: 0;
    animation: fadeIn 0.3s ease;
  }
  .voice-input-container p#voiceInputLabel { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text); text-align: center; }
  .voice-input-form { display: flex; gap: 6px; width: 100%; }
  .voice-input-form input {
    flex: 1; background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 12px; color: var(--text); font-size: 13px; outline: none;
    transition: border-color 0.2s;
  }
  .voice-input-form input:focus { border-color: var(--accent); }
  .voice-input-form button {
    background: var(--accent); border: none; border-radius: 8px;
    color: var(--on-accent); cursor: pointer; padding: 8px 12px;
    transition: background 0.2s; display: flex; align-items: center; justify-content: center;
  }
  .voice-input-form button:hover { background: var(--accent-hover); }
  .voice-input-form button svg { width: 14px; height: 14px; fill: currentColor; }
  .voice-input-form button:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Premium Voice Call Card Design matching inspiration */
  .voice-phone-card {
    width: 100%;
    background: #ffffff;
    border: 2px solid #e2e8f0;
    border-radius: 14px;
    position: relative;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    text-align: left;
    color: #111827;
  }
  .vpc-label {
    display: block;
    padding: 10px 14px 0;
    font-size: 11px;
    font-weight: 700;
    color: #6b7280;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    user-select: none;
  }
  .vpc-required {
    color: #ef4444;
  }
  .phone-input-row {
    display: flex;
    align-items: center;
    padding: 6px 12px 10px;
    gap: 8px;
  }
  .phone-country-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 6px 10px;
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    position: relative;
  }
  .phone-country-selector:hover {
    background: #f1f5f9;
  }
  .country-arrow {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 4px solid #6b7280;
    margin-left: 2px;
    display: inline-block;
    vertical-align: middle;
  }
  .phone-input-row input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    padding: 4px 0;
    min-width: 0;
  }
  .phone-input-row input::placeholder {
    color: #9ca3af;
    font-weight: 400;
    font-size: 14px;
  }
  .phone-input-row button {
    background: #2563eb;
    border: none;
    border-radius: 8px;
    color: #ffffff;
    cursor: pointer;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .phone-input-row button:hover {
    background: #1d4ed8;
  }
  .phone-input-row button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #9ca3af;
  }
  .phone-input-row button svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }

  /* Country Dropdown inside Card */
  .country-dropdown-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #ffffff;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    margin-top: 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
  }
  .country-search-box {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #f1f5f9;
    position: sticky;
    top: 0;
    background: #ffffff;
    z-index: 10;
  }
  .country-search-box .search-icon {
    width: 16px;
    height: 16px;
    fill: #9ca3af;
    margin-right: 8px;
    flex-shrink: 0;
  }
  .country-search-box input {
    width: 100%;
    border: none;
    outline: none;
    font-size: 13px;
    color: #111827;
  }
  .country-options {
    padding: 4px 0;
  }
  .country-option {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    color: #374151;
    gap: 8px;
  }
  .country-option:hover {
    background: #f1f5f9;
    color: #111827;
  }
  .country-option .country-flag {
    font-size: 16px;
  }
  .country-option .country-name {
    flex: 1;
    font-weight: 500;
  }
  .country-option .country-dialcode {
    color: #6b7280;
    font-weight: 600;
  }

  .voice-input-error {
    display: none;
    width: 100%;
    margin-top: 8px;
    color: #ef4444;
    font-size: 12px;
    line-height: 1.4;
    text-align: center;
    font-weight: 500;
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
    
    <div id="voiceInputContainer" class="voice-input-container">
      <p id="voiceInputLabel">Please enter your details</p>

      <!-- Standard Input Form (for Email/text) -->
      <form id="voiceInputForm" class="voice-input-form">
        <input type="text" id="voiceInputField" maxlength="400" autocomplete="off" />
        <button type="submit" id="voiceInputBtn" disabled>
          <svg viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
        </button>
      </form>

      <!-- Phone Input Form (for Phone) -->
      <form id="voicePhoneForm" class="voice-phone-form" style="display: none;">
        <div class="voice-phone-card">
          <p class="vpc-label">Phone number <span class="vpc-required">*</span></p>
          <div class="phone-input-row">
            <div class="phone-country-selector" id="phoneCountrySelector">
              <span id="selectedCountryFlag">🇮🇳</span>
              <span id="selectedCountryCode">+91</span>
              <span class="country-arrow"></span>
            </div>
            <input type="text" id="phoneInputField" placeholder="Enter phone number" autocomplete="tel-national" inputmode="tel" maxlength="10" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10);" />
            <button type="submit" id="phoneInputBtn" disabled>
              <svg viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
            </button>
          </div>
          <div class="country-dropdown-list" id="countryDropdownList" style="display: none;">
            <div class="country-search-box">
              <svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input type="text" id="countrySearchInput" placeholder="Search for countries" autocomplete="off" />
            </div>
            <div class="country-options" id="countryOptions"></div>
          </div>
        </div>
      </form>

      <div id="voiceInputError" class="voice-input-error"></div>
    </div>
    
    <button type="button" id="endCallBtn" class="end-call-btn">End Call</button>
  </div>
</div>

<form class="input-area" id="chatForm">
  ${voiceButtonHtml}
  <input type="text" id="chatInput" maxlength="400" placeholder="${escapeHtml(widgetConfig.inputPlaceholder)}" autocomplete="off" />
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
  var assistantEndingCall = false;
  var assistantEndTimer = null;
  var pendingInputField = null;
  var micMuted = false; // Muted while typed-input textbox is open
  var isVoiceActive = false;

  function resetPlaybackQueue() {
    if (playbackContext) playbackContext.close();
    playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    nextPlayTime = playbackContext.currentTime;
  }

  var voiceOverlay = document.getElementById('voiceOverlay');
  var overlayMicBtn = document.getElementById('overlayMicBtn');
  var overlayMicIcon = document.getElementById('overlayMicIcon');
  var overlayStopIcon = document.getElementById('overlayStopIcon');
  var voiceTimer = document.getElementById('voiceTimer');
  var visualizer = document.getElementById('visualizer');
  var voiceStatus = document.getElementById('voiceStatus');
  var endCallBtn = document.getElementById('endCallBtn');
  
  var voiceInputContainer = document.getElementById('voiceInputContainer');
  var voiceInputLabel = document.getElementById('voiceInputLabel');
  var voiceInputForm = document.getElementById('voiceInputForm');
  var voiceInputField = document.getElementById('voiceInputField');
  var voiceInputBtn = document.getElementById('voiceInputBtn');
  var voiceInputError = document.getElementById('voiceInputError');

  var voicePhoneForm = document.getElementById('voicePhoneForm');
  var phoneCountrySelector = document.getElementById('phoneCountrySelector');
  var selectedCountryFlag = document.getElementById('selectedCountryFlag');
  var selectedCountryCode = document.getElementById('selectedCountryCode');
  var phoneInputField = document.getElementById('phoneInputField');
  var phoneInputBtn = document.getElementById('phoneInputBtn');
  var countryDropdownList = document.getElementById('countryDropdownList');
  var countrySearchInput = document.getElementById('countrySearchInput');

  var COUNTRIES = [
    { name: 'India', code: 'IN', flag: '🇮🇳', dial: '+91', len: [10] },
    { name: 'United States', code: 'US', flag: '🇺🇸', dial: '+1', len: [10] },
    { name: 'United Kingdom', code: 'GB', flag: '🇬🇧', dial: '+44', len: [10] },
    { name: 'Germany', code: 'DE', flag: '🇩🇪', dial: '+49', len: [9, 10, 11] },
    { name: 'Canada', code: 'CA', flag: '🇨🇦', dial: '+1', len: [10] },
    { name: 'Australia', code: 'AU', flag: '🇦🇺', dial: '+61', len: [9] },
    { name: 'United Arab Emirates', code: 'AE', flag: '🇦🇪', dial: '+971', len: [9] },
    { name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦', dial: '+966', len: [9] },
    { name: 'Singapore', code: 'SG', flag: '🇸🇬', dial: '+65', len: [8] },
    { name: 'Malaysia', code: 'MY', flag: '🇲🇾', dial: '+60', len: [9, 10] },
    { name: 'Kenya', code: 'KE', flag: '🇰🇪', dial: '+254', len: [9] },
    { name: 'Nigeria', code: 'NG', flag: '🇳🇬', dial: '+234', len: [10] },
    { name: 'South Africa', code: 'ZA', flag: '🇿🇦', dial: '+27', len: [9] },
    { name: 'Georgia', code: 'GE', flag: '🇬🇪', dial: '+995', len: [9] }
  ];
  var currentSelectedCountry = COUNTRIES[0]; // default to India (+91)

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
    wrap.innerHTML = \`${promptButtons}\`;
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

  function showVoiceInputError(message) {
    if (!voiceInputError) return;
    voiceInputError.textContent = message || '';
    voiceInputError.style.display = message ? 'block' : 'none';
  }

  function renderCountryOptions(filter) {
    var optionsEl = document.getElementById('countryOptions');
    if (!optionsEl) return;
    optionsEl.innerHTML = '';
    var searchStr = (filter || '').toLowerCase();
    var filtered = COUNTRIES.filter(function(c) {
      return c.name.toLowerCase().indexOf(searchStr) !== -1 || c.dial.indexOf(searchStr) !== -1;
    });

    filtered.forEach(function(c) {
      var opt = document.createElement('div');
      opt.className = 'country-option';
      opt.innerHTML = '<span class="country-flag">' + c.flag + '</span>' +
                      '<span class="country-name">' + c.name + '</span>' +
                      '<span class="country-dialcode">' + c.dial + '</span>';
      opt.addEventListener('click', function(e) {
        e.stopPropagation();
        currentSelectedCountry = c;
        selectedCountryFlag.textContent = c.flag;
        selectedCountryCode.textContent = c.dial;
        
        countryDropdownList.style.display = 'none';

        phoneInputField.setAttribute('maxlength', '10');
        phoneInputField.maxLength = 10;
        var sanitized = phoneInputField.value.replace(/[^0-9]/g, '');
        if (sanitized.length > 10) {
          sanitized = sanitized.substring(0, 10);
        }
        phoneInputField.value = sanitized;

        // Trigger validation check on current input value
        var val = phoneInputField.value.trim();
        var validation = validateContactInput('phone', val);
        phoneInputBtn.disabled = !validation.valid;
        if (validation.valid) {
          showVoiceInputError('');
        }
      });
      optionsEl.appendChild(opt);
    });
  }

  function validateContactInput(field, value) {
    var trimmed = String(value || '').trim();
    if (!trimmed) {
      return { valid: false, normalized: '', error: 'Please enter your ' + field + '.' };
    }

    if (field === 'email') {
      var normalizedEmail = trimmed.toLowerCase();
      var emailParts = normalizedEmail.split('@');
      var emailLocal = emailParts[0] || '';
      var emailDomain = emailParts[1] || '';
      var domainLabels = emailDomain.split('.');
      var validEmail = normalizedEmail.length <= 254
        && normalizedEmail.indexOf('..') === -1
        && emailParts.length === 2
        && emailLocal.length > 0
        && emailLocal.length <= 64
        && emailLocal.charAt(0) !== '.'
        && emailLocal.charAt(emailLocal.length - 1) !== '.'
        && /^[a-z0-9!#$%&'*+/=?^_\`{|}~.-]+$/i.test(emailLocal)
        && domainLabels.length >= 2
        && domainLabels.every(function(label) {
          return label.length > 0
            && label.length <= 63
            && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label);
        })
        && /^[a-z]{2,63}$/i.test(domainLabels[domainLabels.length - 1]);
      if (!validEmail) {
        return { valid: false, normalized: normalizedEmail, error: 'Please enter a valid email address like name@example.com.' };
      }
      return { valid: true, normalized: normalizedEmail, error: '' };
    }

    // The selector owns the calling code. Reject arbitrary text instead of
    // silently deleting it and accidentally turning junk into a valid number.
    var subscriber = trimmed;
    if (subscriber.indexOf('+') === 0) {
      var matchedCountry = null;
      for (var i = 0; i < COUNTRIES.length; i++) {
        var candidate = COUNTRIES[i];
        if (
          subscriber.indexOf(candidate.dial) === 0
          && (!matchedCountry || candidate.dial.length > matchedCountry.dial.length)
        ) {
          matchedCountry = candidate;
        }
      }
      if (!matchedCountry) {
        return { valid: false, normalized: trimmed, error: 'Select a country and enter a valid phone number.' };
      }
      currentSelectedCountry = matchedCountry;
      selectedCountryFlag.textContent = matchedCountry.flag;
      selectedCountryCode.textContent = matchedCountry.dial;
      subscriber = subscriber.substring(matchedCountry.dial.length);
    }

    if (!/^[0-9\\s()-]+$/.test(subscriber)) {
      return { valid: false, normalized: trimmed, error: 'Phone numbers can contain digits only.' };
    }

    subscriber = subscriber.replace(/[\\s()-]/g, '');
    var selectedDial = currentSelectedCountry.dial;
    var fullNumber = selectedDial + subscriber;

    if (subscriber.length !== 10) {
      return { valid: false, normalized: fullNumber, error: 'Please enter exactly 10 digits.' };
    }

    if (
      /^(\\d)\\1{7,}$/.test(subscriber)
      || /^(\\d{2,5})\\1+$/.test(subscriber)
      || '01234567890123456789'.indexOf(subscriber) !== -1
      || '98765432109876543210'.indexOf(subscriber) !== -1
    ) {
      return { valid: false, normalized: fullNumber, error: 'Please enter a real phone number, not a repeated or sequential pattern.' };
    }

    return { valid: true, normalized: fullNumber, error: '' };
  }

  function stopVoice() {
    assistantEndingCall = false;
    if (assistantEndTimer) {
      clearTimeout(assistantEndTimer);
      assistantEndTimer = null;
    }
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
    pendingInputField = null;
    micMuted = false;
    showVoiceInputError('');
    if (voiceInputContainer) voiceInputContainer.style.display = 'none';
    setVoiceState('idle');
  }

  function finishVoiceFromAssistant() {
    assistantEndingCall = true;
    if (processor) {
      processor.disconnect();
      processor = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(track) { track.stop(); });
      mediaStream = null;
    }
    if (voiceInputContainer) voiceInputContainer.style.display = 'none';
    if (voiceStatus) voiceStatus.textContent = 'Call ending...';
    if (visualizer) visualizer.classList.remove('active');

    var remainingPlaybackMs = playbackContext
      ? Math.max(0, (nextPlayTime - playbackContext.currentTime) * 1000)
      : 0;

    if (assistantEndTimer) clearTimeout(assistantEndTimer);
    assistantEndTimer = setTimeout(function() {
      stopVoice();
    }, remainingPlaybackMs + 150);
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
          // CRITICAL: Do NOT send audio while typed-input textbox is open.
          // Prevents Gemini from hearing verbal claims like "I already filled it"
          // before the user has submitted verified contact data.
          if (micMuted) return;
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
          resetPlaybackQueue();
          return;
        }
        if (msg.type === 'transcript' && msg.text) {
          addMessage(msg.text, 'bot');
        }
        if (msg.type === 'request_input' && msg.field) {
          resetPlaybackQueue();
          pendingInputField = msg.field;
          micMuted = true; // Mute mic: prevent verbal bypass of typed-input validation
          if (voiceInputContainer) {
            voiceInputContainer.style.display = 'flex';
            voiceInputLabel.textContent = 'Please enter your ' + msg.field;
            if (msg.field === 'phone') {
              voiceInputForm.style.display = 'none';
              voicePhoneForm.style.display = 'block';
              phoneInputField.value = '';
              phoneInputField.setAttribute('maxlength', '10');
              phoneInputField.maxLength = 10;
              phoneInputBtn.disabled = true;
              showVoiceInputError('');
              phoneInputField.focus();
            } else {
              voicePhoneForm.style.display = 'none';
              voiceInputForm.style.display = 'flex';
              voiceInputField.type = msg.field === 'email' ? 'email' : 'text';
              voiceInputField.placeholder = msg.field === 'email' ? 'name@example.com' : 'Your details';
              voiceInputField.maxLength = msg.field === 'email' ? 254 : 32;
              voiceInputField.inputMode = msg.field === 'email' ? 'email' : 'text';
              voiceInputField.value = '';
              voiceInputBtn.disabled = true;
              showVoiceInputError('');
              voiceInputField.focus();
            }
          }
        }
        if (msg.type === 'input_validation_error' && msg.message) {
          pendingInputField = msg.field || pendingInputField;
          micMuted = true; // Keep mic muted on validation error
          if (voiceInputContainer) voiceInputContainer.style.display = 'flex';
          showVoiceInputError(msg.message);
          if (pendingInputField === 'phone') {
            if (phoneInputField) phoneInputField.focus();
            if (phoneInputBtn) phoneInputBtn.disabled = true;
          } else {
            if (voiceInputField) voiceInputField.focus();
            if (voiceInputBtn) voiceInputBtn.disabled = true;
          }
        }
        if (msg.type === 'input_validation_success') {
          pendingInputField = null;
          micMuted = false; // Unmute mic: typed input was verified
          if (voiceInputContainer) voiceInputContainer.style.display = 'none';
          if (voiceInputField) voiceInputField.value = '';
          if (phoneInputField) phoneInputField.value = '';
          showVoiceInputError('');
        }
        if (msg.type === 'appointment_booked' && msg.details) {
          addMessage('Appointment confirmed for ' + new Date(msg.details.startTime).toLocaleString() + '.', 'bot');
        }
        if (msg.type === 'end_call') {
          finishVoiceFromAssistant();
          return;
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
        if (isVoiceActive && !assistantEndingCall) addMessage('Voice call ended.', 'bot');
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

      var res = await fetch(API + '/api/chat/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: BOT_ID, visitorId: visitorId })
      });
      if (res.ok) {
        var data = await res.json();
        sessionId = data.sessionId;
        if (voiceBtn) voiceBtn.disabled = false;
        
        // Show greeting
        if (data.isNew && GREETING) {
          addMessage(GREETING, 'bot');
        } else {
          // Load history
          var histRes = await fetch(API + '/api/chat/history?sessionId=' + encodeURIComponent(sessionId), { method: 'GET' });
          if (histRes.ok) {
            var hist = await histRes.json();
            hist.forEach(function(m) {
              addMessage(m.content, m.sender);
            });
          }
        }
        renderSuggestions();
      }
    } catch (err) {
      console.error('[AI Receptionist Widget] Init error:', err);
    }
  }

  chatForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var text = chatInput.value.trim();
    if (!text || isResponding) return;

    chatInput.value = '';
    addMessage(text, 'user');
    showTyping();
    isResponding = true;
    sendBtn.disabled = true;

    try {
      var response = await fetch(API + '/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: BOT_ID, sessionId: sessionId, content: text, timezone: timezone })
      });
      hideTyping();
      if (response.ok) {
        var data = await response.json();
        if (data.reply) addMessage(data.reply, 'bot');
      } else {
        addMessage('I need a moment to confirm that. Please tell me your preferred date and time again.', 'bot');
      }
    } catch (err) {
      hideTyping();
      addMessage('Sorry, I\'m having trouble connecting right now.', 'bot');
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

  if (voiceInputForm) {
    voiceInputField.addEventListener('input', function() {
      voiceInputBtn.disabled = !voiceInputField.value.trim();
      showVoiceInputError('');
    });
    voiceInputForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var text = voiceInputField.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN || !pendingInputField) return;
      var validation = validateContactInput(pendingInputField, text);
      if (!validation.valid) {
        showVoiceInputError(validation.error);
        return;
      }
      ws.send(JSON.stringify({ type: 'textInput', data: validation.normalized, field: pendingInputField }));
      voiceInputBtn.disabled = true;
      showVoiceInputError('');
    });
  }

  // Country selector toggles
  if (phoneCountrySelector) {
    phoneCountrySelector.addEventListener('click', function(e) {
      e.stopPropagation();
      var show = countryDropdownList.style.display === 'none' || countryDropdownList.style.display === '';
      countryDropdownList.style.display = show ? 'block' : 'none';
      if (show) {
        countrySearchInput.value = '';
        renderCountryOptions('');
        countrySearchInput.focus();
      }
    });
  }

  if (countrySearchInput) {
    countrySearchInput.addEventListener('input', function() {
      renderCountryOptions(countrySearchInput.value);
    });
    countrySearchInput.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  document.addEventListener('click', function() {
    if (countryDropdownList) countryDropdownList.style.display = 'none';
  });

  if (phoneInputField) {
    phoneInputField.addEventListener('input', function() {
      try {
        var cleaned = phoneInputField.value.replace(/[^0-9]/g, '');
        if (cleaned.length > 10) {
          cleaned = cleaned.substring(0, 10);
        }
        phoneInputField.value = cleaned;
        var validation = validateContactInput('phone', cleaned);
        phoneInputBtn.disabled = !validation.valid;
        showVoiceInputError('');
      } catch (e) {
        // swallow any unexpected errors in widget script
      }
    });
  }

  if (voicePhoneForm) {
    voicePhoneForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var text = phoneInputField.value.trim();
      if (!text || !ws || ws.readyState !== WebSocket.OPEN || !pendingInputField) return;
      var validation = validateContactInput('phone', text);
      if (!validation.valid) {
        showVoiceInputError(validation.error);
        return;
      }
      ws.send(JSON.stringify({ type: 'textInput', data: validation.normalized, field: 'phone' }));
      phoneInputBtn.disabled = true;
      showVoiceInputError('');
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  const frameAncestors = buildFrameAncestors(bot.allowed_domains || [], [config.clientUrl]);
  res.setHeader('Content-Security-Policy', frameAncestors ? `frame-ancestors ${frameAncestors}` : "frame-ancestors 'none'");
  
  res.removeHeader('X-Frame-Options');
  res.send(html);
};
