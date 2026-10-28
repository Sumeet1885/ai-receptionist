import React, { useState, useMemo, useEffect } from 'react';
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
  const [copiedNumber, setCopiedNumber] = useState(false);

  const handleCopyNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

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

  // Unified available numbers for outbound caller ID:
  // Combines Dograh platform numbers + connected lines (e.g. +912264230099, +917038455063)
  const availableOutboundOptions = useMemo(() => {
    const list: Array<{
      key: string;
      address: string;
      label?: string | null;
      type: 'platform_number' | 'connected_line' | 'receptionist';
      telephonyConfigId?: number;
      phoneNumberId?: number;
      isCurrentlyAssigned: boolean;
    }> = [];

    // 1. Dograh Numbers
    for (const n of numbers) {
      list.push({
        key: `dograh:${n.telephonyConfigId}:${n.phoneNumberId}`,
        address: n.address,
        label: n.label,
        type: 'platform_number',
        telephonyConfigId: n.telephonyConfigId,
        phoneNumberId: n.phoneNumberId,
        isCurrentlyAssigned: n.address === currentOutboundNumber,
      });
    }

    // 2. Connected lines in status
    if (status?.connectedLines) {
      for (const line of status.connectedLines) {
        if (!list.some(item => item.address === line.phoneNumber)) {
          list.push({
            key: `line:${line.id}:${line.phoneNumber}`,
            address: line.phoneNumber,
            label: line.label || (line.type === 'forwarding' ? 'Mobile SIM' : 'Cloud Line'),
            type: 'connected_line',
            telephonyConfigId: line.telephonyConfigId ? Number(line.telephonyConfigId) : undefined,
            phoneNumberId: line.phoneNumberId ? Number(line.phoneNumberId) : undefined,
            isCurrentlyAssigned: line.phoneNumber === currentOutboundNumber,
          });
        }
      }
    }

    // 3. Status phoneNumber if not yet in list
    if (status?.phoneNumber && !list.some(item => item.address === status.phoneNumber)) {
      list.push({
        key: `receptionist:${status.phoneNumber}`,
        address: status.phoneNumber,
        label: 'Main Receptionist Line',
        type: 'receptionist',
        isCurrentlyAssigned: status.phoneNumber === currentOutboundNumber,
      });
    }

    return list;
  }, [numbers, status?.connectedLines, status?.phoneNumber, currentOutboundNumber]);

  const [selectedOutboundOptionKey, setSelectedOutboundOptionKey] = useState<string>('');

  useEffect(() => {
    if (availableOutboundOptions.length > 0) {
      const match = availableOutboundOptions.find(o => o.isCurrentlyAssigned) || availableOutboundOptions[0];
      if (match) setSelectedOutboundOptionKey(match.key);
    }
  }, [availableOutboundOptions]);

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

  const handleSwitchOutboundNumber = async (selectedKey: string) => {
    const option = availableOutboundOptions.find(o => o.key === selectedKey);
    if (!option) return;
    setSaving(true);
    try {
      if (option.type === 'receptionist' || option.address === status?.phoneNumber) {
        await dograhApi.assignOutboundNumber(botId, { mode: 'same_as_inbound' });
        showToast(`Outgoing Caller ID set to ${option.address} (Same as Receptionist Line)`, 'success');
      } else {
        await dograhApi.assignOutboundNumber(botId, {
          mode: 'platform_default',
          provider: 'pool',
          customPhoneNumber: option.address,
          telephonyConfigId: option.telephonyConfigId,
          phoneNumberId: option.phoneNumberId,
        });
        showToast(`Outgoing Caller ID switched to ${option.address}!`, 'success');
      }
      setIsExpanded(false);
      onUpdated();
    } catch (err: any) {
      showToast(err.message || 'Failed to switch outbound line', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleActivatePlatformDefault = async (keyToUse?: string) => {
    setSaving(true);
    try {
      const key = keyToUse || selectedOutboundOptionKey;
      const found = availableOutboundOptions.find(o => o.key === key);
      let activeKey = numbers[0];
      if (found) {
        await handleSwitchOutboundNumber(found.key);
        return;
      }
      if (!activeKey) {
        throw new Error('No platform number available');
      }
      await dograhApi.assignOutboundNumber(botId, {
        mode: 'platform_default',
        provider: 'pool',
        telephonyConfigId: activeKey.telephonyConfigId,
        phoneNumberId: activeKey.phoneNumberId,
      });
      showToast(`Dedicated outbound line set to ${activeKey.address}!`, 'success');
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
    <div className="space-y-6">
      {/* ── HERO BANNER: DEFAULT OUTBOUND CALLER ID LINE ── */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-sky-500/10 via-brand-bg/90 to-brand-bg border border-sky-500/30 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 text-sky-700 border border-sky-500/30">
                ✨ Ready for Outbound Dials
              </span>
              <span className="text-xs text-brand-muted">• Powered by Managed Telephony</span>
            </div>
            <h5 className="text-lg font-display font-extrabold text-brand-text mt-1">
              Official Outbound Caller ID Line
            </h5>
            <p className="text-xs text-brand-muted max-w-xl">
              We provide this official virtual phone line so you don't need your own Twilio, Plivo, or VoIP credentials. When your AI telecaller calls leads or runs bulk campaigns, this number appears on their phone screens.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto flex-wrap">
            {/* Calendar Integration Status Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-border text-xs font-bold shadow-xs">
              <span>📅</span>
              <span className="text-brand-muted text-[11px] font-medium">Calendar:</span>
              {status?.calendarConnected ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active (Live Booking)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Callback Mode
                </span>
              )}
            </div>

            {currentOutboundNumber ? (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-700 text-xs font-bold shadow-sm">
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                <span>Active & Ready to Dial</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Line Setup Needed</span>
              </div>
            )}
          </div>
        </div>

        {/* Softphone Display Card */}
        <div className="p-5 rounded-xl bg-brand-card/95 border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-700 flex items-center justify-center text-2xl shrink-0">
              📤
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                  Outgoing Caller ID (Active)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-brand-bg border border-brand-border text-sky-700">
                  {currentOutboundTelephony?.provider === 'pool'
                    ? 'Dedicated Virtual Line'
                    : currentOutboundTelephony?.provider === 'forwarding'
                    ? 'Mobile SIM Line'
                    : currentOutboundTelephony?.provider
                    ? `Via ${currentOutboundTelephony.provider.toUpperCase()}`
                    : 'Same as Receptionist Line'}
                </span>
              </div>
              <span className="text-xl sm:text-2xl font-body font-extrabold text-brand-text block mt-0.5 tracking-wide">
                {currentOutboundNumber || defaultCandidateNumber || 'No Line Configured Yet'}
              </span>
              <span className="text-[11px] text-sky-700 font-medium block mt-0.5">
                Verified number used for live test dials and automated bulk campaigns. Customers can easily identify your business.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {currentOutboundNumber && (
              <button
                type="button"
                onClick={() => handleCopyNumber(currentOutboundNumber)}
                className="h-10 px-4 rounded-xl bg-brand-bg hover:bg-brand-card text-brand-text border border-brand-border text-xs font-bold transition flex items-center gap-1.5"
                title="Copy Caller ID"
              >
                {copiedNumber ? <Icons.Check /> : <Icons.Copy />}
                {copiedNumber ? 'Copied!' : 'Copy Caller ID'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExpanded(prev => !prev)}
              className="h-10 px-4 rounded-xl bg-brand-bg hover:bg-brand-card text-brand-text border border-brand-border text-xs font-bold transition flex items-center gap-1.5"
            >
              <span>⚙️</span>
              <span>{isExpanded ? 'Hide Advanced Modes' : 'Advanced Setup'}</span>
            </button>
          </div>
        </div>

        {/* ── Switcher: Available Platform & Connected Numbers for Outbound ── */}
        {availableOutboundOptions.length > 0 && (
          <div className="pt-2 border-t border-brand-border/60">
            <label className="block text-xs font-bold text-brand-text mb-1.5">
              Switch to Another Available Platform Number:
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 max-w-xl">
              <select
                value={selectedOutboundOptionKey}
                onChange={e => setSelectedOutboundOptionKey(e.target.value)}
                disabled={saving}
                className="flex-1 h-10 px-3 rounded-lg bg-brand-card border border-brand-border text-sm text-brand-text focus:border-brand-accent outline-none"
              >
                {availableOutboundOptions.map(n => (
                  <option key={n.key} value={n.key}>
                    {n.address} {n.label ? `(${n.label})` : ''} {n.isCurrentlyAssigned ? '★ (currently assigned)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleSwitchOutboundNumber(selectedOutboundOptionKey)}
                disabled={saving || availableOutboundOptions.find(o => o.key === selectedOutboundOptionKey)?.isCurrentlyAssigned}
                className="h-10 px-5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black border border-sky-400/40 text-xs font-bold transition disabled:opacity-50 shrink-0 shadow-sm"
              >
                {saving ? 'Switching…' : 'Switch'}
              </button>
            </div>
            <p className="text-[11px] text-brand-muted mt-1">
              Select which phone number appears on customers' screens when your AI places outgoing calls and campaigns.
            </p>
          </div>
        )}
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
 ? 'bg-brand-accent text-primary-foreground shadow-sm'
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
 ? 'bg-brand-accent text-primary-foreground shadow-sm'
 : 'text-brand-muted hover:text-brand-text'
 }`}
            >
              ⚡ Dedicated Virtual Outbound Number
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
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/20 text-sky-700 border border-sky-500/30">
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
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-brand-card border border-brand-border flex items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">Candidate Outgoing Number</span>
                      <span className="text-lg font-body font-extrabold text-brand-text">{defaultCandidateNumber}</span>
                      <span className="text-[11px] text-sky-700 block mt-0.5">Managed virtual line • 1-click activation</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleActivatePlatformDefault(selectedOutboundOptionKey || undefined)}
                      disabled={saving}
                      className="h-10 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition flex items-center gap-2 shadow-md disabled:opacity-50 active:scale-95"
                    >
                      {saving ? 'Activating…' : '⚡ Activate Given Number'}
                    </button>
                  </div>

                  {/* Pool Numbers Switcher if multiple available */}
                  {availableOutboundOptions.length > 1 && (
                    <div className="p-4 rounded-xl bg-brand-card border border-brand-border space-y-2">
                      <label className="block text-xs font-bold text-brand-text">
                        Switch to Another Available Platform Number:
                      </label>
                      <div className="flex items-center gap-3 max-w-md">
                        <select
                          value={selectedOutboundOptionKey}
                          onChange={e => setSelectedOutboundOptionKey(e.target.value)}
                          disabled={saving}
                          className="flex-1 h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text focus:border-brand-accent outline-none"
                        >
                          {availableOutboundOptions.map(n => (
                            <option key={n.key} value={n.key}>
                              {n.address} {n.label ? `(${n.label})` : ''} {n.isCurrentlyAssigned ? '★ (currently assigned)' : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSwitchOutboundNumber(selectedOutboundOptionKey)}
                          disabled={saving}
                          className="h-10 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-black border border-sky-400/40 text-xs font-bold transition disabled:opacity-50"
                        >
                          {saving ? 'Switching…' : 'Switch'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-brand-card border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">No Pool Line Available</span>
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

          {/* BYOT carrier credential forms unplugged per Rule 3.5 */}
          {false && setupMode === 'byot' && (
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
                        ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 shadow-sm'
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
                  <h6 className="text-xs font-bold text-amber-700 uppercase tracking-wide">Asterisk ARI Outbound Settings</h6>
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
                  <h6 className="text-xs font-bold text-rose-700 uppercase tracking-wide">Twilio Outbound Settings</h6>
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
                  <h6 className="text-xs font-bold text-sky-700 uppercase tracking-wide">Plivo Outbound Settings</h6>
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
