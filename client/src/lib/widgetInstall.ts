export function getWidgetBaseUrl() {
  return (
    import.meta.env.VITE_WIDGET_BASE_URL ||
    import.meta.env.VITE_EXPRESS_SERVER_URL ||
    window.location.origin
  ).replace(/\/$/, '');
}

export function getWidgetScriptTag(botId: string) {
  return `<script src="${getWidgetBaseUrl()}/widget/loader.js" data-bot-id="${botId}"></script>`;
}

export function isLocalWidgetBaseUrl(url = getWidgetBaseUrl()) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}
