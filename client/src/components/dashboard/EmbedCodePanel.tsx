import React, { useEffect, useState } from 'react';
import { Bot } from '../../types';
import { Icons } from '../common/Icons';
import { getWidgetBaseUrl, getWidgetScriptTag, isLocalWidgetBaseUrl } from '../../lib/widgetInstall';

interface EmbedCodePanelProps {
  activeBot: Bot;
  showToast: (message: string, type?: 'success' | 'error') => void;
  launchPublicChat: (botId: string) => void;
  updateBot: (id: string, updates: Partial<{ allowedDomains: string[] }>) => Promise<void>;
}

function normalizeDomain(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    return url.hostname.toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }
}

export const EmbedCodePanel: React.FC<EmbedCodePanelProps> = ({ activeBot, showToast, launchPublicChat, updateBot }) => {
  const appBaseUrl = window.location.origin;
  const widgetBaseUrl = getWidgetBaseUrl();
  const widgetScript = getWidgetScriptTag(activeBot.id);
  const isLocalInstallScript = isLocalWidgetBaseUrl(widgetBaseUrl);
  const [domainText, setDomainText] = useState((activeBot.allowedDomains || []).join('\n'));
  const [isSavingDomains, setIsSavingDomains] = useState(false);

  useEffect(() => {
    setDomainText((activeBot.allowedDomains || []).join('\n'));
  }, [activeBot.id, activeBot.allowedDomains]);

  const allowedDomains = domainText
    .split(/[\n,]+/)
    .map(normalizeDomain)
    .filter(Boolean);
  const uniqueDomains = Array.from(new Set(allowedDomains));

  const saveAllowedDomains = async () => {
    setIsSavingDomains(true);
    try {
      await updateBot(activeBot.id, { allowedDomains: uniqueDomains });
      setDomainText(uniqueDomains.join('\n'));
      showToast('Allowed domains saved');
    } catch (err: any) {
      showToast(err?.message || 'Could not save allowed domains', 'error');
    } finally {
      setIsSavingDomains(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
      <section className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-brand-border bg-brand-bg/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-xl text-brand-text">Website Install</h3>
            <p className="text-sm text-brand-muted mt-1">Add approved domains, then paste the widget script into the website.</p>
          </div>
          <span className="text-[10px] text-brand-success border border-brand-success/30 bg-brand-success/10 px-2 py-1 rounded font-mono self-start sm:self-center">LIVE</span>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-brand-text">Allowed Domains</h4>
                <p className="text-xs text-brand-muted mt-1">Use domains only, one per line. Example: yourbusiness.com</p>
              </div>
              <span className="text-[10px] font-mono text-brand-muted bg-brand-bg border border-brand-border rounded px-2 py-1">
                {uniqueDomains.length} domains
              </span>
            </div>

            <textarea
              value={domainText}
              onChange={(e) => setDomainText(e.target.value)}
              rows={5}
              placeholder={'yourbusiness.com\nwww.yourbusiness.com'}
              className="w-full resize-y min-h-[128px] bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-sm text-brand-text placeholder:text-brand-muted/60 font-mono focus:outline-none focus:border-brand-accent"
            />

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={saveAllowedDomains}
                disabled={isSavingDomains}
                className="px-4 py-2.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-brand-text rounded-lg text-sm font-bold transition"
              >
                {isSavingDomains ? 'Saving...' : 'Save Domains'}
              </button>
              <button
                onClick={() => setDomainText('localhost\n127.0.0.1')}
                className="px-4 py-2.5 bg-brand-bg hover:bg-brand-border border border-brand-border text-brand-text rounded-lg text-sm font-semibold transition"
              >
                Use Local Test Domains
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-5 border-t border-brand-border">
            <div>
              <h4 className="text-sm font-bold text-brand-text">Embed Widget Script</h4>
              <p className="text-xs text-brand-muted mt-1">Copy this script into the website footer or before the closing body tag.</p>
            </div>

            {isLocalInstallScript && (
              <div className="bg-brand-danger/10 border border-brand-danger/30 rounded-lg p-3 text-sm text-brand-text">
                <p className="font-bold text-brand-danger">This script is local-only.</p>
                <p className="text-xs text-brand-muted mt-1">
                  It points to {widgetBaseUrl}. It will only work on this computer while the backend server is running. For GitHub Pages or any public website, use a deployed HTTPS API URL in VITE_WIDGET_BASE_URL.
                </p>
              </div>
            )}

            <pre className="bg-brand-bg border border-brand-border rounded-lg p-4 text-xs text-brand-muted font-mono overflow-x-auto whitespace-pre-wrap break-all">
              <code>{widgetScript}</code>
            </pre>

            <button
              onClick={() => {
                navigator.clipboard.writeText(widgetScript);
                showToast(isLocalInstallScript ? 'Copied local-only script. Do not use it on public websites.' : 'Copied embed script to clipboard!', isLocalInstallScript ? 'error' : 'success');
              }}
              className="w-full sm:w-auto px-4 py-2.5 bg-brand-card hover:bg-brand-border text-brand-text text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition border border-brand-border"
            >
              <Icons.Copy />
              <span>Copy Script</span>
            </button>
          </div>
        </div>
      </section>

      <aside className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-brand-border bg-brand-bg/40">
          <h3 className="font-display font-bold text-lg text-brand-text">Hosted Chat Link</h3>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-brand-bg border border-brand-border rounded-lg p-4">
            <p className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Public URL</p>
            <p className="text-sm text-brand-accent mt-2 break-all font-mono">
              {appBaseUrl}/chats/{activeBot.subDomain}
            </p>
          </div>

          <button
            onClick={() => {
              const hostedLink = `${appBaseUrl}/chats/${activeBot.subDomain}`;
              navigator.clipboard.writeText(hostedLink);
              showToast('Copied chatbot link to clipboard!');
            }}
            className="w-full py-2.5 bg-brand-bg hover:bg-brand-border text-brand-text text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition border border-brand-border"
          >
            <Icons.Copy />
            <span>Copy Link</span>
          </button>

          <button
            onClick={() => launchPublicChat(activeBot.id)}
            className="w-full py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition border border-brand-border"
          >
            <Icons.ExternalLink />
            <span>Open Preview</span>
          </button>

          <div className="pt-4 border-t border-brand-border space-y-2">
            <p className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Current Allowed Domains</p>
            {uniqueDomains.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {uniqueDomains.map(domain => (
                  <span key={domain} className="px-2.5 py-1 bg-brand-bg border border-brand-border rounded-md text-xs font-mono text-brand-text">
                    {domain}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-brand-muted">No domains added yet.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
