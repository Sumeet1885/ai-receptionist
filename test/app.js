const botInput = document.getElementById('botId');
const hostInput = document.getElementById('widgetHost');
const snippet = document.getElementById('snippet');
const injectButton = document.getElementById('injectButton');
const removeButton = document.getElementById('removeButton');
const message = document.getElementById('message');

let injectedScript = null;

function cleanHost(value) {
  return value.replace(/\/+$/, '');
}

function getScriptTag() {
  const host = cleanHost(hostInput.value.trim() || 'http://localhost:4000');
  const botId = botInput.value.trim() || 'YOUR_BOT_ID';
  return `<script src="${host}/widget/loader.js" data-bot-id="${botId}"></script>`;
}

function updateSnippet() {
  snippet.textContent = getScriptTag();
}

function removeWidget() {
  if (injectedScript) {
    injectedScript.remove();
    injectedScript = null;
  }

  document.getElementById('air-widget-bubble')?.remove();
  document.getElementById('air-widget-container')?.remove();

  Array.from(document.querySelectorAll('style')).forEach((style) => {
    if (style.textContent?.includes('#air-widget-bubble')) {
      style.remove();
    }
  });

  window.__aiReceptionistLoaded = undefined;
  removeButton.disabled = true;
  injectButton.textContent = 'Inject Widget';
  message.textContent = 'Widget removed.';
}

function injectWidget() {
  const botId = botInput.value.trim();
  const host = cleanHost(hostInput.value.trim());

  if (!botId) {
    message.textContent = 'Paste a real bot UUID first.';
    botInput.focus();
    return;
  }

  removeWidget();

  const script = document.createElement('script');
  script.src = `${host}/widget/loader.js`;
  script.dataset.botId = botId;
  script.async = true;
  script.onerror = () => {
    message.textContent = `Could not load ${script.src}. Is your backend running?`;
  };
  script.onload = () => {
    message.textContent = 'Widget script loaded. Click the bottom-right bubble.';
  };

  document.body.appendChild(script);
  injectedScript = script;
  removeButton.disabled = false;
  injectButton.textContent = 'Re-inject Widget';
}

botInput.addEventListener('input', updateSnippet);
hostInput.addEventListener('input', updateSnippet);
injectButton.addEventListener('click', injectWidget);
removeButton.addEventListener('click', removeWidget);

updateSnippet();
