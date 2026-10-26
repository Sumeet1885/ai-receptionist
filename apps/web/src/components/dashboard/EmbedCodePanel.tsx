import React, { useEffect, useState } from 'react';
import { Bot } from '../../types';
import { Icons } from '../common/Icons';
import { getWidgetBaseUrl, getWidgetScriptTag, isLocalWidgetBaseUrl } from '../../lib/widgetInstall';
import { AllowedDomainsEditor } from './AllowedDomainsEditor';
import { normalizeDomains } from '../../lib/domain';

interface EmbedCodePanelProps {
  activeBot: Bot;
  showToast: (message: string, type?: 'success' | 'error') => void;
  launchPublicChat: (botId: string) => void;
  updateBot: (id: string, updates: Partial<{ allowedDomains: string[] }>) => Promise<void>;
}

export const EmbedCodePanel: React.FC<EmbedCodePanelProps> = ({ activeBot, showToast, launchPublicChat, updateBot }) => {
  const appBaseUrl = window.location.origin;
  const widgetBaseUrl = getWidgetBaseUrl();
  const widgetScript = getWidgetScriptTag(activeBot.id);
  const isLocalInstallScript = isLocalWidgetBaseUrl(widgetBaseUrl);
  const hasPublicDomains = normalizeDomains(activeBot.allowedDomains || []).some(domain => !['localhost', '127.0.0.1', '::1'].includes(domain));
  const [domains, setDomains] = useState<string[]>(activeBot.allowedDomains || []);
  const [isSavingDomains, setIsSavingDomains] = useState(false);

  useEffect(() => {
    setDomains(activeBot.allowedDomains || []);
  }, [activeBot.id, activeBot.allowedDomains]);

  const saveAllowedDomains = async () => {
    setIsSavingDomains(true);
    try {
      const uniqueDomains = normalizeDomains(domains);
      await updateBot(activeBot.id, { allowedDomains: uniqueDomains });
      setDomains(uniqueDomains);
      showToast('Allowed domains saved');
    } catch (err: any) {
      showToast(err?.message || 'Could not save allowed domains', 'error');
    } finally {
      setIsSavingDomains(false);
    }
  };

  return (
    <div>
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
            <AllowedDomainsEditor
              domains={domains}
              onChange={setDomains}
              description="Add one domain per row. You can remove a domain with Delete or add another with +."
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
                onClick={() => setDomains(['localhost', '127.0.0.1'])}
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
              <div className="bg-brand-warning/10 border border-brand-warning/30 rounded-lg p-3 text-sm text-brand-text">
                <p className="font-bold text-brand-warning">This script still points to your local backend.</p>
                <p className="text-xs text-brand-muted mt-1">
                  Allowed domains are saved separately and do not change the script source. Right now the embed script points to {widgetBaseUrl}, so it will only work while this local backend is running. To use it on a real website, set `VITE_WIDGET_BASE_URL` or `VITE_EXPRESS_SERVER_URL` to your deployed HTTPS backend and redeploy the client.
                </p>
                {hasPublicDomains && (
                  <p className="text-xs text-brand-muted mt-2">
                    Your public domain list is fine. The only thing still local is the backend URL inside the script tag.
                  </p>
                )}
              </div>
            )}

            <pre className="bg-brand-bg border border-brand-border rounded-lg p-4 text-xs text-brand-muted font-mono overflow-x-auto whitespace-pre-wrap break-all">
              <code>{widgetScript}</code>
            </pre>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(widgetScript);
                  showToast(isLocalInstallScript ? 'Copied script with local backend URL.' : 'Copied embed script to clipboard!', isLocalInstallScript ? 'error' : 'success');
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-brand-card hover:bg-brand-border text-brand-text text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition border border-brand-border"
              >
                <Icons.Copy />
                <span>Copy Script</span>
              </button>
            <div className="pt-5 border-t border-brand-border grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
              <div>
                <p className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Hosted Chat Link</p>
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
                className="w-full sm:w-auto px-4 py-2.5 bg-brand-bg hover:bg-brand-border text-brand-text text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 transition border border-brand-border"
              >
                <Icons.Copy />
                <span>Copy Link</span>
              </button>
            </div>

            <div className="pt-4 border-t border-brand-border space-y-2">
              <p className="text-[10px] text-brand-muted font-mono uppercase tracking-wider">Current Allowed Domains</p>
              {normalizeDomains(domains).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {normalizeDomains(domains).map(domain => (
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
        </div>
      </section>
    </div>
  );
};
