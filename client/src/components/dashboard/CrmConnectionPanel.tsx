import React, { useCallback, useEffect, useState } from 'react';
import { Icons } from '../common/Icons';
import { crmApi } from '../../lib/crmApi';

interface CrmConnectionPanelProps {
  botId: string;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

type ConnectionState = 'loading' | 'connected' | 'disconnected' | 'error';

export const CrmConnectionPanel: React.FC<CrmConnectionPanelProps> = ({ botId, showToast }) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [saving, setSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [signingSecret, setSigningSecret] = useState('');

  const loadConnection = useCallback(async () => {
    setConnectionState('loading');
    try {
      const status = await crmApi.getStatus(botId);
      setConnectionState(status.connected ? 'connected' : 'disconnected');
    } catch (error) {
      console.error(error);
      setConnectionState('error');
    }
  }, [botId]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  const handleConnect = async () => {
    if (!webhookUrl.trim() || !apiKey.trim()) {
      showToast('Webhook URL and API key are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await crmApi.connect(botId, {
        webhookUrl: webhookUrl.trim(),
        apiKey: apiKey.trim(),
        signingSecret: signingSecret.trim() || undefined,
      });
      setWebhookUrl('');
      setApiKey('');
      setSigningSecret('');
      setConnectionState('connected');
      showToast('CRM connected');
    } catch (err: any) {
      showToast('Failed to connect CRM: ' + (err.message || err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      await crmApi.disconnect(botId);
      setConnectionState('disconnected');
      showToast('CRM disconnected');
    } catch (err: any) {
      showToast('Failed to disconnect CRM: ' + (err.message || err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 sm:px-6 py-4 border-b border-brand-border flex items-center justify-between gap-3 bg-brand-bg/40">
          <div>
            <h3 className="font-display font-bold text-brand-text text-lg flex items-center gap-2"><Icons.Globe /> CRM</h3>
            <p className="text-xs text-brand-muted mt-1">Leads captured by this agent are mirrored into your own CRM as they come in.</p>
          </div>
          <button type="button" onClick={loadConnection} className="text-xs font-mono text-brand-accent hover:text-brand-accent-hover flex items-center gap-1">
            <Icons.Refresh /> Refresh
          </button>
        </div>

        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${connectionState === 'connected' ? 'bg-brand-success/10 border-brand-success/30 text-brand-success' : 'bg-brand-bg border-brand-border text-brand-muted'}`}>
              {connectionState === 'connected' ? <Icons.Check /> : <Icons.Globe />}
            </div>
            <div>
              <p className="text-sm font-bold text-brand-text">
                {connectionState === 'connected' ? 'Connected to your CRM' : connectionState === 'loading' ? 'Checking CRM connection…' : connectionState === 'error' ? 'Connection status unavailable' : 'Not connected'}
              </p>
              <p className="text-xs text-brand-muted mt-0.5">
                {connectionState === 'connected' ? 'New leads with a name and phone number are sent automatically.' : 'Paste your CRM webhook URL and API key below to start syncing leads.'}
              </p>
            </div>
          </div>
          {connectionState === 'connected' && (
            <button type="button" onClick={handleDisconnect} disabled={saving} className="h-10 px-4 rounded-lg border border-brand-border text-brand-danger hover:border-brand-danger/50 text-xs font-bold transition disabled:opacity-50">
              Disconnect
            </button>
          )}
        </div>
      </section>

      {connectionState !== 'connected' && connectionState !== 'loading' && (
        <section className="bg-brand-card border border-brand-border rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
          <a
            href="https://mylagnagath.com/settings/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent hover:text-brand-accent-hover transition"
          >
            Create CRM Credentials
            <Icons.ExternalLink />
          </a>

          <div>
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted mb-1.5">Webhook URL</label>
            <input
              className="w-full h-10 bg-brand-bg border border-brand-border rounded-md px-3 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent transition"
              placeholder="https://your-crm.com/api/webhooks/website/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted mb-1.5">API Key</label>
            <input
              type="password"
              className="w-full h-10 bg-brand-bg border border-brand-border rounded-md px-3 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent transition"
              placeholder="wlk_live_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-brand-muted mb-1.5">Signing Secret (Optional)</label>
            <input
              type="password"
              className="w-full h-10 bg-brand-bg border border-brand-border rounded-md px-3 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-brand-accent transition"
              placeholder="Used to sign each lead with HMAC-SHA256"
              value={signingSecret}
              onChange={(e) => setSigningSecret(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={handleConnect}
            disabled={saving}
            className="h-10 px-5 bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold rounded-md transition disabled:opacity-50"
          >
            Connect CRM
          </button>
        </section>
      )}
    </div>
  );
};
