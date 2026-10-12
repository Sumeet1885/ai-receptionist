import React, { useState } from 'react';
import { Icons } from '../../components/common/Icons';
import { PhoneInputField } from '../../components/common/PhoneInputField';
import { validateContactInput } from '../../lib/contactValidation';
import { dograhApi, PhoneAgentStatus, DograhNumber } from './dograhApi';

interface OutboundLineSetupCardProps {
  botId: string;
  status: PhoneAgentStatus | null;
  numbers: DograhNumber[];
  showToast: (message: string, type?: 'success' | 'error') => void;
  onUpdated: () => void;
}

type OutboundSetupMode = 'same_as_inbound' | 'platform_default' | 'byot';
type OutboundProviderType = 'asterisk' | 'twilio' | 'plivo' | 'vonage' | 'telnyx';

export const OutboundLineSetupCard: React.FC<OutboundLineSetupCardProps> = ({
  botId,
  status,
  numbers,
  showToast,
  onUpdated,
}) => {
  const currentOutboundTelephony = status?.outboundTelephony || null;
  const currentOutboundNumber = status?.outboundPhoneNumber || status?.phoneNumber || null;
  const isDedicatedOutboundActive = Boolean(currentOutboundTelephony && currentOutboundTelephony.phoneNumber);

  const initialMode: OutboundSetupMode = currentOutboundTelephony
    ? (currentOutboundTelephony.provider === 'pool' ? 'platform_default' : 'byot')
    : 'same_as_inbound';

  const [setupMode, setSetupMode] = useState<OutboundSetupMode>(initialMode);
  const [selectedProvider, setSelectedProvider] = useState<OutboundProviderType>(
    (currentOutboundTelephony?.provider as OutboundProviderType) || 'twilio'
  );
  const [saving, setSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Form Fields for BYOT
  const [customPhone, setCustomPhone] = useState(currentOutboundTelephony?.phoneNumber || '');
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [plivoAuthId, setPlivoAuthId] = useState('');
  const [plivoAuthToken, setPlivoAuthToken] = useState('');
  // Asterisk ARI
  const [asteriskAriEndpoint, setAsteriskAriEndpoint] = useState('http://asterisk.example.com:8088');
  const [asteriskAppName, setAsteriskAppName] = useState('dograh');
  const [asteriskAppPassword, setAsteriskAppPassword] = useState('');
  const [asteriskWsClientName, setAsteriskWsClientName] = useState('dograh');

  const defaultCandidateNumber = numbers[0]?.address || status?.defaultPlatformNumber || '';

  const handleUseSameAsInbound = async () => {
    setSaving(true);
    try {
      await dograhApi.assignOutboundNumber(botId, { mode: 'same_as_inbound' });
      showToast('Outgoing calls will now use your primary receptionist number as Caller ID.', 'success');
      setSetupMode('same_as_inbound');
      setIsExpanded(false);
      onUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to update outbound line', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleActivatePlatformDefault = async () => {
    setSaving(true);
    try {
      const activeKey = numbers[0];
      await dograhApi.assignOutboundNumber(botId, {
        mode: 'platform_default',
        provider: 'pool',
        telephonyConfigId: activeKey?.telephonyConfigId,
        phoneNumberId: activeKey?.phoneNumberId,
      });
      showToast('Dedicated platform outbound line activated successfully!', 'success');
      setSetupMode('platform_default');
      setIsExpanded(false);
      onUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to activate outbound platform line', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomOutbound = async () => {
    setSaving(true);
    try {
      if (selectedProvider === 'asterisk') {
        if (!asteriskAriEndpoint.trim() || !asteriskAppName.trim()) {
          showToast('ARI endpoint and username are required', 'error');
          setSaving(false);
          return;
        }

        await dograhApi.assignOutboundNumber(botId, {
          mode: 'byot',
          provider: 'asterisk',
          customPhoneNumber: customPhone.trim() || '8000',
          credentials: {
            ariEndpoint: asteriskAriEndpoint.trim(),
            appName: asteriskAppName.trim(),
            appPassword: asteriskAppPassword.trim() || undefined,
            wsClientName: asteriskWsClientName.trim() || 'dograh',
            dialStringTemplate: 'PJSIP/{number}',
            isDefaultOutbound: true,
          },
          label: `Asterisk Outbound (${asteriskAppName.trim()})`,
        });
      } else if (selectedProvider === 'twilio') {
        const validation = validateContactInput('phone', customPhone);
        if (!validation.valid || !validation.normalized) {
          showToast(validation.error || 'Please enter a valid phone number with country code', 'error');
          setSaving(false);
          return;
        }
        if (!twilioSid.trim()) {
          showToast('Twilio Account SID is required (starts with AC...)', 'error');
          setSaving(false);
          return;
        }

        await dograhApi.assignOutboundNumber(botId, {
          mode: 'byot',
          provider: 'twilio',
          customPhoneNumber: validation.normalized,
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim() || undefined,
          },
          label: 'Twilio Outbound Line',
        });
      } else if (selectedProvider === 'plivo') {
        const validation = validateContactInput('phone', customPhone);
        if (!validation.valid || !validation.normalized) {
          showToast(validation.error || 'Please enter a valid phone number with country code', 'error');
          setSaving(false);
          return;
        }
        if (!plivoAuthId.trim()) {
          showToast('Plivo Auth ID is required', 'error');
          setSaving(false);
          return;
        }

        await dograhApi.assignOutboundNumber(botId, {
          mode: 'byot',
          provider: 'plivo',
          customPhoneNumber: validation.normalized,
          credentials: {
            authId: plivoAuthId.trim(),
            authToken: plivoAuthToken.trim() || undefined,
          },
          label: 'Plivo Outbound Line',
        });
      }

      showToast(`Custom outbound line configured!`, 'success');
      setSetupMode('byot');
      setIsExpanded(false);
      onUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to save custom outbound line', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-5 lg:p-6 shadow-sm space-y-5">
      {/* Top Banner: Current Outgoing Caller ID Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-brand-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-display font-extrabold text-brand-text">
              Outgoing Caller ID & Phone Line
            </h4>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
              {isDedicatedOutboundActive ? 'Dedicated Line' : 'Same as Receptionist Line'}
            </span>
          </div>
          <p className="text-xs text-brand-muted">
            The phone number that appears on people's phones when your AI dials out. You can use our given platform number, your own carrier, or your receptionist line.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="px-3.5 py-2 rounded-xl bg-brand-bg hover:bg-brand-card text-brand-text border border-brand-border text-xs font-bold transition flex items-center gap-2 self-start sm:self-auto"
        >
          <span>⚙️</span>
          <span>{isExpanded ? 'Hide Settings' : 'Change Outgoing Number'}</span>
        </button>
      </div>

      {/* Summary Card of currently active outbound line */}
      <div className="p-4 rounded-xl bg-brand-bg/60 border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center text-xl shrink-0">
            📤
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                Active Outgoing Caller ID:
              </span>
              <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-brand-card border border-brand-border text-sky-400">
                {currentOutboundTelephony?.provider ? `Via ${currentOutboundTelephony.provider.toUpperCase()}` : 'Default Inbound Line'}
              </span>
            </div>
            <span className="text-lg font-mono font-extrabold text-brand-text mt-0.5 block">
              {currentOutboundNumber || 'No Line Configured Yet'}
            </span>
          </div>
        </div>

        <div className="text-xs text-brand-muted sm:text-right">
          {isDedicatedOutboundActive ? (
            <p className="text-sky-400 font-semibold">Separate dedicated outbound number active</p>
          ) : (
            <p className="text-emerald-400 font-semibold">Using main receptionist line (Customers can call back)</p>
          )}
          <p className="text-[11px] text-brand-muted mt-0.5">Used for test calls and bulk campaigns</p>
        </div>
      </div>

      {/* Expanded Configuration Section */}
      {isExpanded && (
        <div className="pt-2 space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 p-1 rounded-xl bg-brand-bg border border-brand-border overflow-x-auto">
            {/* Tab 1: Same as inbound */}
            <button
              type="button"
              onClick={() => setSetupMode('same_as_inbound')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition whitespace-nowrap text-center ${
                setupMode === 'same_as_inbound'
                  ? 'bg-brand-accent text-brand-bg shadow-sm'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              🔄 Same as Receptionist Line
            </button>

            {/* Tab 2: Priority 1 - Our Given Number */}
            <button
              type="button"
              onClick={() => setSetupMode('platform_default')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition whitespace-nowrap text-center ${
                setupMode === 'platform_default'
                  ? 'bg-brand-accent text-brand-bg shadow-sm'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              ⚡ Priority 1: Given Platform Number
            </button>

            {/* Tab 3: Option 2 - Configure Their Own */}
            <button
              type="button"
              onClick={() => setSetupMode('byot')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition whitespace-nowrap text-center ${
                setupMode === 'byot'
                  ? 'bg-brand-accent text-brand-bg shadow-sm'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              ⚙️ Option 2: Configure Your Own Carrier
            </button>
          </div>

          {/* VIEW 1: SAME AS INBOUND */}
          {setupMode === 'same_as_inbound' && (
            <div className="p-5 rounded-xl bg-brand-bg/80 border border-brand-border space-y-4">
              <div className="space-y-1">
                <h5 className="text-sm font-bold text-brand-text">Mirror Inbound Receptionist Line (Recommended)</h5>
                <p className="text-xs text-brand-muted">
                  The AI receptionist will call using your main incoming line ({status?.phoneNumber || 'not configured yet'}). If customers miss your call, they can tap redial to reach your AI receptionist immediately.
                </p>
              </div>

              <button
                type="button"
                onClick={handleUseSameAsInbound}
                disabled={saving}
                className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {saving ? 'Updating…' : '✓ Use Receptionist Line for Outgoing'}
              </button>
            </div>
          )}

          {/* VIEW 2: PRIORITY 1 - OUR GIVEN NUMBER */}
          {setupMode === 'platform_default' && (
            <div className="p-5 rounded-xl bg-gradient-to-br from-sky-500/10 via-brand-bg/90 to-brand-bg border border-sky-500/30 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/20 text-sky-400 border border-sky-500/30">
                      ✨ Priority 1 Ready
                    </span>
                    <span className="text-xs font-bold text-brand-text">Dedicated Outbound Platform Number</span>
                  </div>
                  <p className="text-xs text-brand-muted mt-1 max-w-xl">
                    We provide a dedicated cloud phone number specifically for outgoing dials. This keeps high-volume outreach campaigns completely separate from your main customer support number.
                  </p>
                </div>
              </div>

              {defaultCandidateNumber ? (
                <div className="p-4 rounded-xl bg-brand-card border border-brand-border flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">Candidate Outgoing Number</span>
                    <span className="text-lg font-mono font-extrabold text-brand-text">{defaultCandidateNumber}</span>
                    <span className="text-[11px] text-sky-400 block mt-0.5">Managed virtual line • 1-click activation</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleActivatePlatformDefault}
                    disabled={saving}
                    className="h-10 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition flex items-center gap-2 shadow-md disabled:opacity-50 active:scale-95"
                  >
                    {saving ? 'Activating…' : '⚡ Activate Given Number'}
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-brand-card border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">No Pool Line Available</span>
                    <span className="text-xs font-bold text-brand-text block mt-0.5">No shared platform outbound line provisioned</span>
                    <span className="text-[11px] text-brand-muted block mt-0.5">Please mirror your main receptionist line or connect a Twilio / Asterisk carrier.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSetupMode('same_as_inbound')}
                    className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-1.5 shadow-sm self-start sm:self-auto shrink-0"
                  >
                    <span>Use Receptionist Line →</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: OPTION 2 - CONFIGURE THEIR OWN CARRIER */}
          {setupMode === 'byot' && (
            <div className="p-5 rounded-xl bg-brand-bg/80 border border-brand-border space-y-4">
              <div>
                <h5 className="text-sm font-bold text-brand-text">Option 2: Connect Your Own Outbound Carrier</h5>
                <p className="text-xs text-brand-muted mt-0.5">
                  Connect your company's own Asterisk PBX extension, Twilio account, or Plivo trunk to dial out with your own carrier credentials.
                </p>
              </div>

              {/* Provider Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {(['asterisk', 'twilio', 'plivo'] as OutboundProviderType[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedProvider(p)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                      selectedProvider === p
                        ? 'bg-sky-500/15 border-sky-500/40 text-sky-400 shadow-sm'
                        : 'bg-brand-card border-brand-border text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    {p === 'asterisk' ? '⭐ Asterisk ARI PBX' : p === 'twilio' ? 'Twilio Voice' : 'Plivo Voice'}
                  </button>
                ))}
              </div>

              {/* Asterisk Form */}
              {selectedProvider === 'asterisk' && (
                <div className="p-4 rounded-xl bg-brand-card border border-brand-border space-y-3">
                  <h6 className="text-xs font-bold text-amber-400 uppercase tracking-wide">Asterisk ARI Outbound Settings</h6>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1 text-xs text-brand-muted">
                      ARI Base URL
                      <input
                        type="text"
                        value={asteriskAriEndpoint}
                        onChange={e => setAsteriskAriEndpoint(e.target.value)}
                        placeholder="http://asterisk.example.com:8088"
                        className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-brand-muted">
                      ARI Username
                      <input
                        type="text"
                        value={asteriskAppName}
                        onChange={e => setAsteriskAppName(e.target.value)}
                        placeholder="dograh"
                        className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-brand-muted">
                      ARI Password
                      <input
                        type="password"
                        value={asteriskAppPassword}
                        onChange={e => setAsteriskAppPassword(e.target.value)}
                        placeholder="Secret password"
                        className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-brand-muted">
                      Caller Extension / SIP Number
                      <input
                        type="text"
                        value={customPhone}
                        onChange={e => setCustomPhone(e.target.value)}
                        placeholder="8000"
                        className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Twilio Form */}
              {selectedProvider === 'twilio' && (
                <div className="p-4 rounded-xl bg-brand-card border border-brand-border space-y-3">
                  <h6 className="text-xs font-bold text-rose-400 uppercase tracking-wide">Twilio Outbound Settings</h6>
                  <div className="space-y-3">
                    <PhoneInputField
                      label="Your Twilio Outbound Phone Number"
                      defaultCountry="US"
                      value={customPhone}
                      onChange={val => setCustomPhone(val)}
                      placeholder="e.g. +1 555 123 4567"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1 text-xs text-brand-muted">
                        Account SID
                        <input
                          type="text"
                          value={twilioSid}
                          onChange={e => setTwilioSid(e.target.value)}
                          placeholder="AC..."
                          className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                        />
                      </label>
                      <div className="flex flex-col gap-1 text-xs text-brand-muted">
                        <div className="flex items-center justify-between">
                          <span>Auth Token</span>
                          <button
                            type="button"
                            onClick={() => setShowTwilioToken(!showTwilioToken)}
                            className="text-[11px] text-brand-accent hover:underline font-bold"
                          >
                            {showTwilioToken ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        <input
                          type={showTwilioToken ? 'text' : 'password'}
                          value={twilioToken}
                          onChange={e => setTwilioToken(e.target.value)}
                          placeholder="Auth Token"
                          className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Plivo Form */}
              {selectedProvider === 'plivo' && (
                <div className="p-4 rounded-xl bg-brand-card border border-brand-border space-y-3">
                  <h6 className="text-xs font-bold text-sky-400 uppercase tracking-wide">Plivo Outbound Settings</h6>
                  <div className="space-y-3">
                    <PhoneInputField
                      label="Your Plivo Outbound Phone Number"
                      defaultCountry="US"
                      value={customPhone}
                      onChange={val => setCustomPhone(val)}
                      placeholder="e.g. +1 555 123 4567"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1 text-xs text-brand-muted">
                        Auth ID
                        <input
                          type="text"
                          value={plivoAuthId}
                          onChange={e => setPlivoAuthId(e.target.value)}
                          placeholder="MAM..."
                          className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-brand-muted">
                        Auth Token
                        <input
                          type="password"
                          value={plivoAuthToken}
                          onChange={e => setPlivoAuthToken(e.target.value)}
                          placeholder="Auth Token"
                          className="h-9 px-3 rounded-lg bg-brand-bg border border-brand-border text-xs text-brand-text font-mono"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveCustomOutbound}
                disabled={saving}
                className="h-10 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : '✓ Save Custom Outbound Line'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
