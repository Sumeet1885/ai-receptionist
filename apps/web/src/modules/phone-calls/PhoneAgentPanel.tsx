import { formatDateTimeIST } from '@ai-receptionist/contracts';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Icons } from '../../components/common/Icons';
import { validateContactInput } from '../../lib/contactValidation';
import { dograhApi, DograhNumber, PhoneAgentStatus, ConnectedPhoneLine } from './dograhApi';
import { PhoneInputField } from '../../components/common/PhoneInputField';

interface PhoneAgentPanelProps {
  botId: string;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onProvisionedChange?: (isReady: boolean) => void;
}

type ProviderType = 'asterisk' | 'twilio' | 'plivo' | 'vonage' | 'telnyx' | 'forwarding' | 'pool';
type TelephonyMode = 'platform-default' | 'byot';

export const PhoneAgentPanel: React.FC<PhoneAgentPanelProps> = ({ botId, showToast, onProvisionedChange }) => {
  const [status, setStatus] = useState<PhoneAgentStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [numbers, setNumbers] = useState<DograhNumber[]>([]);
  const [selectedNumberKey, setSelectedNumberKey] = useState('');
  const [assigning, setAssigning] = useState(false);
  // Line management states
  const [unassigning, setUnassigning] = useState(false);
  const [unlinkingLineId, setUnlinkingLineId] = useState<string | null>(null);
  const [settingPrimaryLineId, setSettingPrimaryLineId] = useState<string | null>(null);
  const [activeCopiedNumber, setActiveCopiedNumber] = useState<string | null>(null);
  const connectLineSectionRef = useRef<HTMLDivElement>(null);
  const [highlightConnectSection, setHighlightConnectSection] = useState(false);

  // Telephony Mode: 'platform-default' (Priority 1) vs 'byot' (Priority 2)
  const [telephonyMode, setTelephonyMode] = useState<TelephonyMode>('platform-default');

  // Selected BYOT Telephony Provider
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('twilio');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Provider Credential Form States
  // Asterisk ARI
  const [asteriskName, setAsteriskName] = useState('Asterisk Main PBX');
  const [asteriskAriEndpoint, setAsteriskAriEndpoint] = useState('http://asterisk.example.com:8088');
  const [asteriskAppName, setAsteriskAppName] = useState('dograh');
  const [asteriskAppPassword, setAsteriskAppPassword] = useState('');
  const [asteriskWsClientName, setAsteriskWsClientName] = useState('dograh');
  const [asteriskPhone, setAsteriskPhone] = useState('8000');
  const [asteriskDialStringTemplate, setAsteriskDialStringTemplate] = useState('PJSIP/{number}');
  const [asteriskIsDefaultOutbound, setAsteriskIsDefaultOutbound] = useState(false);
  const [stasisAppName, setStasisAppName] = useState('');
  const [copiedStasis, setCopiedStasis] = useState(false);
  // Twilio
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioPhone, setTwilioPhone] = useState('');
  const [twilioLabel, setTwilioLabel] = useState('');

  // Plivo
  const [plivoAuthId, setPlivoAuthId] = useState('');
  const [plivoAuthToken, setPlivoAuthToken] = useState('');
  const [plivoAppId, setPlivoAppId] = useState('');
  const [plivoPhone, setPlivoPhone] = useState('');

  // Vonage
  const [vonageApiKey, setVonageApiKey] = useState('');
  const [vonageApiSecret, setVonageApiSecret] = useState('');
  const [vonageAppId, setVonageAppId] = useState('');
  const [vonagePhone, setVonagePhone] = useState('');

  // Telnyx
  const [telnyxApiKey, setTelnyxApiKey] = useState('');
  const [telnyxConnectionId, setTelnyxConnectionId] = useState('');
  const [telnyxPhone, setTelnyxPhone] = useState('');

  // Carrier Forwarding / Mobile
  const [forwardingPhone, setForwardingPhone] = useState('');

  // Rate Limits
  const [inboundCooldownInput, setInboundCooldownInput] = useState('');
  const [inboundHourlyCapInput, setInboundHourlyCapInput] = useState('');
  const [savingInboundRateLimit, setSavingInboundRateLimit] = useState(false);
  const [outboundCooldownInput, setOutboundCooldownInput] = useState('');
  const [outboundHourlyCapInput, setOutboundHourlyCapInput] = useState('');
  const [savingOutboundRateLimit, setSavingOutboundRateLimit] = useState(false);

  const inboundWebhookUrl = status?.inboundWebhookUrl || 'https://staging-dograh.recrui8.com/api/v1/telephony/inbound/run';

  const onProvisionedChangeRef = useRef(onProvisionedChange);
  useEffect(() => {
    onProvisionedChangeRef.current = onProvisionedChange;
  }, [onProvisionedChange]);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await dograhApi.getStatus(botId);
      setStatus(data);

      if (data.phoneNumber) {
        setTwilioPhone(data.phoneNumber);
        setPlivoPhone(data.phoneNumber);
        setVonagePhone(data.phoneNumber);
        setTelnyxPhone(data.phoneNumber);
        setAsteriskPhone(data.phoneNumber);
      }

      const existingFwd = data.connectedLines?.find(l => l.type === 'forwarding');
      if (existingFwd) {
        setForwardingPhone(existingFwd.phoneNumber);
      } else if (data.telephony?.provider === 'forwarding' && data.telephony.phoneNumber) {
        setForwardingPhone(data.telephony.phoneNumber);
      }

      if (data.telephony) {
        if (data.telephony.provider && ['asterisk', 'twilio', 'plivo', 'vonage', 'telnyx', 'forwarding'].includes(data.telephony.provider)) {
          setSelectedProvider(data.telephony.provider as ProviderType);
          setTelephonyMode('byot');
        } else {
          setTelephonyMode('platform-default');
          setSelectedProvider('pool');
        }
        if (data.telephony.provider === 'asterisk') {
          if (data.telephony.label) setAsteriskName(data.telephony.label);
          if (data.telephony.credentials?.ariEndpoint) setAsteriskAriEndpoint(data.telephony.credentials.ariEndpoint);
          if (data.telephony.credentials?.appName) setAsteriskAppName(data.telephony.credentials.appName);
          if (data.telephony.credentials?.wsClientName) setAsteriskWsClientName(data.telephony.credentials.wsClientName);
          if (data.telephony.credentials?.dialStringTemplate) setAsteriskDialStringTemplate(data.telephony.credentials.dialStringTemplate);
          if (data.telephony.credentials?.stasisAppName) setStasisAppName(data.telephony.credentials.stasisAppName);
          if (typeof data.telephony.credentials?.isDefaultOutbound === 'boolean') {
            setAsteriskIsDefaultOutbound(data.telephony.credentials.isDefaultOutbound);
          }
        }
        if (data.telephony.credentials?.accountSid) setTwilioSid(data.telephony.credentials.accountSid);
        if (data.telephony.credentials?.authId) setPlivoAuthId(data.telephony.credentials.authId);
        if (data.telephony.credentials?.appId) setPlivoAppId(data.telephony.credentials.appId);
        if (data.telephony.credentials?.apiKey) {
          setVonageApiKey(data.telephony.credentials.apiKey);
          setTelnyxApiKey(data.telephony.credentials.apiKey);
        }
        if (data.telephony.credentials?.connectionId) setTelnyxConnectionId(data.telephony.credentials.connectionId);
        if (data.telephony.label) setTwilioLabel(data.telephony.label);
      }

      setOutboundCooldownInput(String(data.outboundCooldownSeconds ?? 10));
      setOutboundHourlyCapInput(String(data.outboundHourlyCap ?? 20));
      setInboundCooldownInput(String(data.inboundCooldownSeconds ?? 10));
      setInboundHourlyCapInput(String(data.inboundHourlyCap ?? 20));
      onProvisionedChangeRef.current?.(Boolean(data.outboundProvisioned && (data.outboundPhoneNumber || data.phoneNumber)));
    } catch (err: any) {
      showToast(err.message || 'Could not load phone agent status', 'error');
    } finally {
      setLoadingStatus(false);
    }
  }, [botId, showToast]);

  const loadNumbers = useCallback(async () => {
    try {
      const data = await dograhApi.listNumbers(botId);
      setNumbers(data.numbers);
      const assigned = data.numbers.find(n => n.isAssignedToThisBot);
      setSelectedNumberKey(prev => {
        if (prev && data.numbers.some(n => `${n.telephonyConfigId}:${n.phoneNumberId}` === prev)) {
          return prev; // Preserve user's current selection!
        }
        if (assigned) {
          return `${assigned.telephonyConfigId}:${assigned.phoneNumberId}`;
        }
        if (data.numbers.length > 0) {
          return `${data.numbers[0].telephonyConfigId}:${data.numbers[0].phoneNumberId}`;
        }
        return '';
      });
    } catch (err: any) {
      console.warn('Could not load telephony pool numbers:', err);
      setNumbers([]);
    }
  }, [botId]);

  useEffect(() => {
    void loadStatus();
    void loadNumbers();
  }, [loadStatus, loadNumbers]);

  const handleCopyWebhook = () => {
    void navigator.clipboard.writeText(inboundWebhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
    showToast('Inbound Webhook URL copied to clipboard!', 'success');
  };

  const handleCopyNumber = (num: string) => {
    void navigator.clipboard.writeText(num);
    setActiveCopiedNumber(num);
    setCopiedNumber(true);
    setTimeout(() => {
      setCopiedNumber(false);
      setActiveCopiedNumber(null);
    }, 2000);
    showToast(`Phone number ${num} copied!`, 'success');
  };

  const handleRemoveLine = async (lineId: string, phone: string) => {
    if (!confirm(`Are you sure you want to unlink ${phone} from this receptionist agent?`)) return;
    setUnlinkingLineId(lineId);
    try {
      await dograhApi.removePhoneLine(botId, lineId);
      showToast(`Phone line ${phone} unlinked successfully!`, 'success');
      await loadStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove line', 'error');
    } finally {
      setUnlinkingLineId(null);
    }
  };

  const handleSetPrimaryLine = async (lineId: string, role: 'inbound' | 'outbound') => {
    setSettingPrimaryLineId(lineId);
    try {
      await dograhApi.setPrimaryLine(botId, lineId, role);
      showToast(`Updated primary ${role} phone line!`, 'success');
      await loadStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to set primary line', 'error');
    } finally {
      setSettingPrimaryLineId(null);
    }
  };

  const isNumberAlreadyConnected = (phone: string) => {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 5) return false;
    const lines = status?.connectedLines || [];
    return lines.some(l => l.phoneNumber.replace(/\D/g, '') === digits);
  };

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
    showToast(`Copied dial code: ${code}`, 'success');
  };

  const handleStartConnectLine = (providerType: ProviderType = 'forwarding') => {
    setTelephonyMode('byot');
    setSelectedProvider(providerType);
    setHighlightConnectSection(true);
    setTimeout(() => {
      connectLineSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    setTimeout(() => {
      setHighlightConnectSection(false);
    }, 2800);
  };

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      await dograhApi.provision(botId);
      showToast('Phone agent provisioned successfully.', 'success');
      await loadStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to provision the phone agent', 'error');
    } finally {
      setProvisioning(false);
    }
  };

  const handleUnassign = async () => {
    setUnassigning(true);
    try {
      await dograhApi.unassignNumber(botId);
      showToast('Phone number disconnected and returned to the pool.', 'success');
      setSelectedNumberKey('');
      await Promise.all([loadStatus(), loadNumbers()]);
    } catch (err: any) {
      showToast(err.message || 'Failed to disconnect the phone number', 'error');
    } finally {
      setUnassigning(false);
    }
  };

  const handleAssignDefaultNumber = async (targetKey?: string) => {
    setAssigning(true);
    try {
      if (!status?.provisioned) {
        showToast('Provisioning agent workflows first…', 'success');
        await dograhApi.provision(botId);
      }

      const activeKey = targetKey || selectedNumberKey || (numbers[0] ? `${numbers[0].telephonyConfigId}:${numbers[0].phoneNumberId}` : '999999:999999');
      const [configId, numberId] = activeKey.split(':').map(Number);

      const result = await dograhApi.assignNumber(botId, {
        provider: 'pool',
        telephonyConfigId: configId || 999999,
        phoneNumberId: numberId || 999999,
      });

      showToast(`Phone line ${result.phoneNumber} activated successfully!`, 'success');
      await loadStatus();
      await loadNumbers();
    } catch (err: any) {
      showToast(err.message || 'Failed to activate default number', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleSaveProvider = async () => {
    setAssigning(true);
    try {
      if (selectedProvider === 'pool') {
        await handleAssignDefaultNumber();
        return;
      } else if (selectedProvider === 'asterisk') {
        if (!asteriskPhone.trim()) {
          showToast('Please enter a SIP extension or phone number for outbound/inbound calls (e.g. 8000)', 'error');
          setAssigning(false);
          return;
        }
        if (/[\s,&]/.test(asteriskPhone.trim())) {
          showToast('SIP extension cannot contain spaces, commas, or ampersands', 'error');
          setAssigning(false);
          return;
        }
        if (!asteriskAriEndpoint.trim()) {
          showToast('Please enter your ARI base URL (e.g., http://asterisk.example.com:8088)', 'error');
          setAssigning(false);
          return;
        }
        if (!asteriskAppName.trim()) {
          showToast('Please enter your ARI username (matching section name in ari.conf)', 'error');
          setAssigning(false);
          return;
        }
        if (!asteriskAppPassword.trim() && !status?.telephony?.credentials?.hasSecret) {
          showToast('Please enter your ARI user password configured in ari.conf', 'error');
          setAssigning(false);
          return;
        }
        if (!asteriskWsClientName.trim()) {
          showToast('Please enter your websocket_client.conf connection name for externalMedia', 'error');
          setAssigning(false);
          return;
        }

        const result = await dograhApi.assignNumber(botId, {
          provider: 'asterisk',
          customPhoneNumber: asteriskPhone.trim(),
          credentials: {
            ariEndpoint: asteriskAriEndpoint.trim(),
            appName: asteriskAppName.trim(),
            appPassword: asteriskAppPassword.trim() || undefined,
            wsClientName: asteriskWsClientName.trim(),
            dialStringTemplate: asteriskDialStringTemplate.trim() || 'PJSIP/{number}',
            isDefaultOutbound: asteriskIsDefaultOutbound,
          },
          label: asteriskName.trim() || `Asterisk ARI (${asteriskAppName.trim()})`,
        });

        if (result.stasisAppName) {
          setStasisAppName(result.stasisAppName);
        }
        showToast(`Asterisk ARI telephony configured! Extension ${result.phoneNumber} connected.`, 'success');
      } else if (selectedProvider === 'twilio') {
        const validation = validateContactInput('phone', twilioPhone);
        if (!validation.valid || !validation.normalized) {
          showToast(validation.error || 'Please enter a valid Twilio phone number with country code', 'error');
          setAssigning(false);
          return;
        }
        if (!twilioSid.trim()) {
          showToast('Please provide your Twilio Account SID (starts with AC...)', 'error');
          setAssigning(false);
          return;
        }
        if (!twilioToken.trim() && !status?.telephony?.credentials?.hasSecret) {
          showToast('Please provide your Twilio Auth Token', 'error');
          setAssigning(false);
          return;
        }

        const result = await dograhApi.assignNumber(botId, {
          provider: 'twilio',
          customPhoneNumber: validation.normalized,
          credentials: {
            accountSid: twilioSid.trim(),
            authToken: twilioToken.trim() || undefined,
            label: twilioLabel.trim() || undefined,
          },
          label: twilioLabel.trim() || 'Twilio Voice',
        });
        showToast(`Twilio number ${result.phoneNumber} connected!`, 'success');
      } else if (selectedProvider === 'plivo') {
        const validation = validateContactInput('phone', plivoPhone);
        if (!validation.valid || !validation.normalized) {
          showToast(validation.error || 'Please enter a valid Plivo phone number with country code', 'error');
          setAssigning(false);
          return;
        }
        if (!plivoAuthId.trim()) {
          showToast('Please enter your Plivo Auth ID', 'error');
          setAssigning(false);
          return;
        }
        if (!plivoAuthToken.trim() && !status?.telephony?.credentials?.hasSecret) {
          showToast('Please enter your Plivo Auth Token', 'error');
          setAssigning(false);
          return;
        }

        const result = await dograhApi.assignNumber(botId, {
          provider: 'plivo',
          customPhoneNumber: validation.normalized,
          credentials: {
            authId: plivoAuthId.trim(),
            authToken: plivoAuthToken.trim() || undefined,
            appId: plivoAppId.trim() || undefined,
          },
          label: 'Plivo Voice',
        });
        showToast(`Plivo number ${result.phoneNumber} connected!`, 'success');
      } else if (selectedProvider === 'vonage') {
        const validation = validateContactInput('phone', vonagePhone);
        if (!validation.valid || !validation.normalized) {
          showToast(validation.error || 'Please enter a valid Vonage phone number', 'error');
          setAssigning(false);
          return;
        }
        if (!vonageApiKey.trim() || (!vonageApiSecret.trim() && !status?.telephony?.credentials?.hasSecret)) {
          showToast('Please enter your Vonage API Key and Secret', 'error');
          setAssigning(false);
          return;
        }

        const result = await dograhApi.assignNumber(botId, {
          provider: 'vonage',
          customPhoneNumber: validation.normalized,
          credentials: {
            apiKey: vonageApiKey.trim(),
            apiSecret: vonageApiSecret.trim() || undefined,
            appId: vonageAppId.trim() || undefined,
          },
          label: 'Vonage Voice',
        });
        showToast(`Vonage number ${result.phoneNumber} connected!`, 'success');
      } else if (selectedProvider === 'telnyx') {
        const validation = validateContactInput('phone', telnyxPhone);
        if (!validation.valid || !validation.normalized) {
          showToast(validation.error || 'Please enter a valid Telnyx phone number', 'error');
          setAssigning(false);
          return;
        }
        if (!telnyxApiKey.trim()) {
          showToast('Please enter your Telnyx API Key', 'error');
          setAssigning(false);
          return;
        }

        const result = await dograhApi.assignNumber(botId, {
          provider: 'telnyx',
          customPhoneNumber: validation.normalized,
          credentials: {
            apiKey: telnyxApiKey.trim(),
            connectionId: telnyxConnectionId.trim() || undefined,
          },
          label: 'Telnyx Voice',
        });
        showToast(`Telnyx number ${result.phoneNumber} connected!`, 'success');
      } else if (selectedProvider === 'forwarding') {
        const validation = validateContactInput('phone', forwardingPhone);
        if (!validation.valid || !validation.normalized) {
          showToast(validation.error || 'Please enter a valid mobile number with country code', 'error');
          setAssigning(false);
          return;
        }

        const result = await dograhApi.assignNumber(botId, {
          provider: 'forwarding',
          customPhoneNumber: validation.normalized,
          label: 'Carrier Call Forwarding',
        });
        showToast(`Forwarding number ${result.phoneNumber} configured!`, 'success');
      }

      await loadStatus();
      await loadNumbers();
    } catch (err: any) {
      showToast(err.message || 'Failed to connect telephony provider', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleSaveInboundRateLimit = async () => {
    const cooldown = Number(inboundCooldownInput);
    const cap = Number(inboundHourlyCapInput);
    if (!Number.isFinite(cooldown) || cooldown < 0 || !Number.isFinite(cap) || cap < 1) {
      showToast('Enter valid inbound cooldown (0+) and hourly cap (1+).', 'error');
      return;
    }
    setSavingInboundRateLimit(true);
    try {
      const res = await dograhApi.updateInboundRateLimit(botId, cooldown, cap);
      setStatus(prev => prev ? { ...prev, inboundCooldownSeconds: res.inboundCooldownSeconds, inboundHourlyCap: res.inboundHourlyCap } : prev);
      showToast('Inbound limits updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update inbound limits', 'error');
    } finally {
      setSavingInboundRateLimit(false);
    }
  };

  const handleSaveOutboundRateLimit = async () => {
    const cooldown = Number(outboundCooldownInput);
    const cap = Number(outboundHourlyCapInput);
    if (!Number.isFinite(cooldown) || cooldown < 0 || !Number.isFinite(cap) || cap < 1) {
      showToast('Enter valid outbound cooldown (0+) and hourly cap (1+).', 'error');
      return;
    }
    setSavingOutboundRateLimit(true);
    try {
      const res = await dograhApi.updateOutboundRateLimit(botId, cooldown, cap);
      setStatus(prev => prev ? { ...prev, outboundCooldownSeconds: res.outboundCooldownSeconds, outboundHourlyCap: res.outboundHourlyCap } : prev);
      showToast('Outbound limits updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update outbound limits', 'error');
    } finally {
      setSavingOutboundRateLimit(false);
    }
  };

  const byotProviders = [
    {
      id: 'forwarding' as ProviderType,
      name: 'Mobile SIM Forwarding',
      tag: 'SIM / Office',
      desc: 'Forward calls from your personal or work SIM number',
      icon: (
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 flex items-center justify-center font-bold text-sm">
          📱
        </div>
      ),
    },
  ];

  const assignedPoolNumber = numbers.find(n => `${n.telephonyConfigId}:${n.phoneNumberId}` === selectedNumberKey)?.address;
  const defaultCandidateNumber = assignedPoolNumber || status?.phoneNumber || status?.defaultPlatformNumber || numbers[0]?.address || '';
  const isDefaultLineActive = Boolean(status?.phoneNumber && (status.phoneNumber === (assignedPoolNumber || status.phoneNumber) || status.telephony?.provider === 'pool'));

  const connectedLines: ConnectedPhoneLine[] = (status?.connectedLines && status.connectedLines.length > 0)
    ? status.connectedLines
    : (status?.phoneNumber ? [{
        id: 'default_line',
        phoneNumber: status.phoneNumber,
        type: (status.outboundPhoneNumber === status.phoneNumber || !status.outboundPhoneNumber) ? 'both' : 'inbound',
        provider: (status.telephony?.provider || 'pool') as any,
        label: status.telephony?.label || (status.telephony?.provider === 'pool' ? 'Default Receptionist Line' : `${(status.telephony?.provider || 'Platform').toUpperCase()} Inbound Line`),
        status: 'active' as const,
        isPrimaryInbound: true,
        isPrimaryOutbound: Boolean(status.outboundPhoneNumber === status.phoneNumber || !status.outboundPhoneNumber),
        configuredAt: status.telephony?.configuredAt || new Date().toISOString(),
      }] : []);

  const inboundLines = connectedLines.filter(line => line.type !== 'outbound' || line.isPrimaryInbound);

  return (
    <div className="space-y-6">
      {/* ── PERSISTENT CONNECTED PHONE NUMBERS CARD (unplugged per Rule 3.5 to eliminate duplicate number display) ── */}
      {false && (
        <div className="bg-brand-card border border-brand-border rounded-2xl p-5 lg:p-6 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-display font-extrabold text-brand-text flex items-center gap-2">
                  <span>📱</span> Inbound Reception Lines
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                  {inboundLines.length} {inboundLines.length === 1 ? 'Line' : 'Lines'} Active
                </span>
              </div>
              <p className="text-[11px] text-brand-muted mt-0.5">
                Phone numbers connected to your 24/7 AI receptionist. When callers dial these numbers, your AI answers immediately.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => handleStartConnectLine('forwarding')}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 border border-cyan-500/30 text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
                title="Forward your existing mobile or business SIM card"
              >
                <span>📱</span> + Link Mobile SIM
              </button>
            </div>
          </div>

          {inboundLines.length === 0 ? (
            <div className="p-4 rounded-xl bg-brand-bg/80 border border-brand-border text-center text-xs text-brand-muted flex flex-col sm:flex-row items-center justify-between gap-3">
              <span>No inbound reception numbers connected yet. Activate a virtual line or link your mobile SIM.</span>
              <button
                type="button"
                onClick={() => handleStartConnectLine('forwarding')}
                className="px-3 py-1.5 rounded-lg bg-brand-accent text-primary-foreground hover:bg-brand-accent-hover hover:text-primary-foreground text-xs font-bold transition"
              >
                + Connect Your Number
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {inboundLines.map(line => (
                <div
                  key={line.id}
                  className="p-3.5 sm:p-4 rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent/40 transition flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg shrink-0 ${
                        line.type === 'forwarding'
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-700'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                      }`}
                    >
                      {line.type === 'forwarding' ? '📱' : '📞'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-body text-sm sm:text-base font-extrabold text-brand-text truncate">
                          {line.phoneNumber}
                        </span>

                        {/* Inbound Role Badges */}
                        {line.isPrimaryInbound ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Primary Reception Line
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-card text-brand-muted border border-brand-border">
                            Secondary Inbound Line
                          </span>
                        )}

                        {/* Clean Line Type Badge */}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-brand-card border border-brand-border text-brand-muted">
                          {line.type === 'forwarding'
                            ? 'Mobile SIM Forward'
                            : (line.provider === 'pool' ? 'Cloud Virtual Line' : (line.provider ? `${line.provider.toUpperCase()} Line` : 'Cloud Virtual Line'))}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-brand-muted mt-1">
                        <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {line.isPrimaryInbound ? 'Live & Answering 24/7' : 'Backup Line Active'}
                        </span>
                        {line.type === 'forwarding' && (
                          <>
                            <span>•</span>
                            <span>Carrier Forwarding</span>
                          </>
                        )}
                        {line.configuredAt && (
                          <>
                            <span>•</span>
                            <span>Added {formatDateTimeIST(line.configuredAt)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                    <button
                      type="button"
                      onClick={() => handleCopyNumber(line.phoneNumber)}
                      className="h-8 px-2.5 rounded-lg bg-brand-card hover:bg-brand-border text-brand-text border border-brand-border text-xs font-semibold transition flex items-center gap-1"
                      title="Copy phone number"
                    >
                      {copiedNumber && activeCopiedNumber === line.phoneNumber ? <Icons.Check /> : <Icons.Copy />}
                      <span>{copiedNumber && activeCopiedNumber === line.phoneNumber ? 'Copied!' : 'Copy'}</span>
                    </button>

                    {/* Set Primary Inbound */}
                    {!line.isPrimaryInbound && (
                      <button
                        type="button"
                        disabled={settingPrimaryLineId === line.id}
                        onClick={() => handleSetPrimaryLine(line.id, 'inbound')}
                        className="h-8 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 border border-emerald-500/25 text-xs font-semibold transition disabled:opacity-50"
                      >
                        Set as Primary Inbound
                      </button>
                    )}

                    {/* Unlink */}
                    <button
                      type="button"
                      disabled={unlinkingLineId === line.id}
                      onClick={() => handleRemoveLine(line.id, line.phoneNumber)}
                      className="h-8 px-2.5 rounded-lg hover:bg-rose-500/15 text-brand-muted hover:text-rose-700 border border-transparent hover:border-rose-500/30 text-xs font-semibold transition disabled:opacity-50"
                      title="Unlink phone line"
                    >
                      <Icons.Trash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 2. INCOMING CALLS SETUP (DEFAULT NUMBER PRIORITY 1 VS CUSTOM CARRIER) ── */}
      <div
        ref={connectLineSectionRef}
        className={`bg-brand-card border rounded-2xl p-5 lg:p-6 shadow-sm space-y-6 transition-all duration-300 ${
          highlightConnectSection
            ? 'border-brand-accent ring-4 ring-brand-accent/30 shadow-lg scale-[1.002]'
            : 'border-brand-border'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-brand-border">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-display font-extrabold text-brand-text">
                {telephonyMode === 'byot' ? '📥 Connect Your Phone Line (BYOC / Mobile SIM)' : '📥 Incoming Receptionist Phone Number'}
              </h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                telephonyMode === 'byot'
                  ? 'bg-cyan-500/15 text-cyan-700 border border-cyan-500/30'
                  : 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
              }`}>
                {telephonyMode === 'platform-default' ? 'Priority 1: Default Ready Line' : 'Connect Your Own Number'}
              </span>
            </div>
            <p className="text-xs text-brand-muted mt-0.5">
              {telephonyMode === 'byot'
                ? 'Enter your mobile SIM or external carrier details below to connect another number to your AI receptionist.'
                : 'The phone number where customers reach your AI receptionist. Use our instant ready-to-go number, or connect your own provider/PBX.'}
            </p>
          </div>

          {/* Segmented Mode Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-brand-bg border border-brand-border self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setTelephonyMode('platform-default');
                setSelectedProvider('pool');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
 telephonyMode === 'platform-default'
 ? 'bg-brand-accent text-primary-foreground shadow-sm'
 : 'text-brand-muted hover:text-brand-text'
 }`}
            >
              <span>⚡</span> Instant Ready Number
            </button>

            <button
              type="button"
              onClick={() => {
                setTelephonyMode('byot');
                setSelectedProvider('forwarding');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                telephonyMode === 'byot'
                  ? 'bg-brand-accent text-primary-foreground shadow-sm'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <span>📱</span> Mobile SIM Forwarding
            </button>
          </div>
        </div>

        {/* ── PRIORITY 1: DEFAULT PLATFORM LINE (RECOMMENDED & OUT-OF-THE-BOX) ── */}
        {telephonyMode === 'platform-default' && (
          <div className="space-y-6">
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-brand-bg/90 to-brand-bg border border-emerald-500/30 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
                      ✨ Ready Out-Of-The-Box
                    </span>
                    <span className="text-xs text-brand-muted">• Powered by Managed Telephony</span>
                  </div>
                  <h5 className="text-lg font-display font-extrabold text-brand-text mt-1">
                    Default AI Receptionist Line
                  </h5>
                  <p className="text-xs text-brand-muted max-w-xl">
                    We provide this official virtual phone line so you don't need your own Twilio, Plivo, or VoIP credentials. Customers calling this number will be answered live by your AI receptionist persona.
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

                  {isDefaultLineActive ? (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 text-xs font-bold shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Active & Connected</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>Ready to Activate</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Softphone Display Card */}
              {status?.phoneNumber || defaultCandidateNumber ? (
                <div className="p-5 rounded-xl bg-brand-card/95 border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 flex items-center justify-center text-2xl shrink-0">
                      📞
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                        {status?.phoneNumber && !assignedPoolNumber ? 'Active Receptionist Line' : 'Receptionist Line (Selected)'}
                      </span>
                      <span className="text-xl sm:text-2xl font-body font-extrabold text-brand-text block mt-0.5 tracking-wide">
                        {assignedPoolNumber || status?.phoneNumber || defaultCandidateNumber}
                      </span>
                      <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                        {status?.phoneNumber
                          ? 'Live 24/7 receptionist line ready for customers. Dial this number from your mobile phone to test the live conversation.'
                          : 'Pre-configured ready line — 1-click activation to connect directly to your receptionist.'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {status?.phoneNumber ? (
                      <button
                        type="button"
                        onClick={() => handleCopyNumber(status.phoneNumber!)}
                        className="h-10 px-4 rounded-xl bg-brand-bg hover:bg-brand-card text-brand-text border border-brand-border text-xs font-bold transition flex items-center gap-1.5"
                      >
                        {copiedNumber ? <Icons.Check /> : <Icons.Copy />}
                        {copiedNumber ? 'Copied!' : 'Copy Line Number'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAssignDefaultNumber(selectedNumberKey)}
                        disabled={assigning}
                        className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-2 shadow-lg disabled:opacity-50 active:scale-95"
                      >
                        {assigning ? (
                          <>
                            <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            Activating Line…
                          </>
                        ) : (
                          <>
                            <span>⚡</span> Activate Default Line
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-brand-card/95 border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 flex items-center justify-center text-2xl shrink-0">
                      📱
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                        No Shared Virtual Line Available
                      </span>
                      <span className="text-sm font-bold text-brand-text block mt-0.5">
                        Connect your line using Call Forwarding (SIM) or Bring Your Own Carrier
                      </span>
                      <span className="text-[11px] text-brand-muted block mt-0.5">
                        Link your phone number so incoming customer calls reach this receptionist.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTelephonyMode('byot');
                      setSelectedProvider('forwarding');
                    }}
                    className="h-10 px-5 rounded-xl bg-brand-accent text-primary-foreground hover:bg-brand-accent-hover hover:text-primary-foreground text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm"
                  >
                    <span>Connect Line →</span>
                  </button>
                </div>
              )}

              {/* Pool Numbers Switcher if multiple available */}
              {numbers.length > 1 && (
                <div className="pt-2 border-t border-brand-border/60">
                  <label className="block text-xs font-bold text-brand-text mb-1.5">
                    Switch to Another Available Platform Number:
                  </label>
                  <div className="flex items-center gap-3 max-w-md">
                    <select
                      value={selectedNumberKey}
                      onChange={e => setSelectedNumberKey(e.target.value)}
                      disabled={assigning}
                      className="flex-1 h-10 px-3 rounded-lg bg-brand-card border border-brand-border text-sm text-brand-text focus:border-brand-accent outline-none"
                    >
                      {numbers.map(n => (
                        <option key={`${n.telephonyConfigId}:${n.phoneNumberId}`} value={`${n.telephonyConfigId}:${n.phoneNumberId}`}>
                          {n.address} {n.label ? `(${n.label})` : ''} {n.isAssignedToThisBot ? '★ (currently assigned)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAssignDefaultNumber(selectedNumberKey)}
                      disabled={assigning}
                      className="h-10 px-4 rounded-lg bg-brand-card hover:bg-brand-accent/20 text-brand-text hover:text-brand-accent border border-brand-border text-xs font-bold transition disabled:opacity-50"
                    >
                      {assigning ? 'Assigning…' : 'Switch'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── PRIORITY 2: BRING YOUR OWN CARRIER (BYOT) ── */}
        {telephonyMode === 'byot' && (
          <div className="space-y-6">
            <div>
              <h5 className="text-sm font-bold text-brand-text">Select Your Telephony Carrier</h5>
              <p className="text-xs text-brand-muted mt-0.5">
                Connect your mobile SIM or external VoIP provider account. Incoming calls to your number will route directly to Dograh.
              </p>
            </div>

            {/* Provider Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {byotProviders.map(p => {
                const isSelected = selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProvider(p.id)}
                    className={`p-3.5 rounded-xl border text-left transition relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-brand-accent/10 border-brand-accent shadow-sm'
                        : 'bg-brand-bg/50 border-brand-border hover:border-brand-accent/50 hover:bg-brand-bg/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {p.icon}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
 isSelected ? 'bg-brand-accent text-primary-foreground ' : 'bg-brand-card text-brand-muted'
 }`}>
                        {p.tag}
                      </span>
                    </div>
                    <div className="mt-3">
                      <h5 className="text-xs font-bold text-brand-text">{p.name}</h5>
                      <p className="text-[10px] text-brand-muted mt-0.5 line-clamp-1">{p.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Provider Form Container */}
            <div className="p-5 rounded-xl bg-brand-bg border border-brand-border space-y-5">
              {/* Universal Inbound Webhook Box for BYOT */}
              {/* Universal Inbound Webhook Box for BYOT - Hidden inside collapsible Advanced details */}
              {['twilio', 'plivo', 'vonage', 'telnyx'].includes(selectedProvider) && (
                <details className="rounded-xl bg-brand-bg/60 border border-brand-border group text-xs overflow-hidden transition-all">
                  <summary className="p-3.5 cursor-pointer font-semibold text-brand-muted hover:text-brand-text flex items-center justify-between select-none">
                    <span className="flex items-center gap-2">
                      <span className="text-brand-accent">⚙️</span>
                      <span className="font-sans text-xs font-bold text-brand-text">Advanced: Carrier Webhook URL</span>
                      <span className="text-[10px] text-brand-muted font-normal hidden sm:inline">(Only needed for manual Twilio / Plivo console routing)</span>
                    </span>
                    <span className="text-[11px] font-body text-brand-accent group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="p-3.5 pt-2 border-t border-brand-border/60 space-y-2 bg-brand-card/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted font-body">
                        Webhook Endpoint
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyWebhook}
                        className="px-2.5 py-1 rounded-lg bg-brand-accent/15 hover:bg-brand-accent/25 text-brand-accent text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
                      >
                        {copiedWebhook ? <Icons.Check /> : <Icons.Copy />}
                        {copiedWebhook ? 'Copied!' : 'Copy Webhook URL'}
                      </button>
                    </div>
                    <div className="p-2.5 rounded-lg bg-brand-bg font-body text-xs text-brand-text break-all border border-brand-border select-all">
                      {inboundWebhookUrl}
                    </div>
                    <p className="text-[11px] text-brand-muted leading-relaxed">
                      HTTP Method: <span className="font-body text-brand-text font-bold">POST</span>. When configuring your Twilio/Plivo number manually, paste this into your carrier console under &quot;A Call Comes In&quot;.
                    </p>
                  </div>
                </details>
              )}

              {/* 🌟 ASTERISK ARI FORM */}
              {selectedProvider === 'asterisk' && (
                <div className="space-y-5">
                  <div className="border-b border-brand-border pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <h5 className="text-sm font-bold text-brand-text">
                          Add Telephony Configuration: Asterisk ARI
                        </h5>
                        <a
                          href="https://docs.dograh.com/integrations/telephony/asterisk-ari"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 border border-amber-500/25 hover:bg-amber-500/20 transition"
                        >
                          Asterisk ARI docs ↗
                        </a>
                      </div>
                      <p className="text-xs text-brand-muted mt-1">
                        Connect a telephony provider account. Phone numbers and extensions are added and configured directly with Dograh.
                      </p>
                    </div>
                  </div>

                  {/* Outbound Default Option */}
                  <div className="p-3.5 rounded-xl bg-brand-card border border-brand-border flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="asterisk-default-outbound"
                      checked={asteriskIsDefaultOutbound}
                      onChange={e => setAsteriskIsDefaultOutbound(e.target.checked)}
                      className="mt-0.5 rounded bg-brand-bg border-brand-border text-brand-accent focus:ring-brand-accent"
                    />
                    <label htmlFor="asterisk-default-outbound" className="text-xs text-brand-text cursor-pointer select-none">
                      <span className="font-bold block">Use as default outbound configuration</span>
                      <span className="text-brand-muted block text-[11px] mt-0.5">
                        Used by test calls and campaigns when no specific config is selected. Your organization has no default yet.
                      </span>
                    </label>
                  </div>

                  {/* Form Fields Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Configuration Name <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Asterisk Main PBX"
                        value={asteriskName}
                        onChange={e => setAsteriskName(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">Friendly name to identify this Asterisk connection in Dograh</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        SIP Extensions / Numbers for Outbound Calls <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 8000 or 1001 or PJSIP/6001"
                        value={asteriskPhone}
                        onChange={e => setAsteriskPhone(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">
                        SIP extension/number for outbound calls and incoming call reception
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        ARI Base URL <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="http://asterisk.example.com:8088"
                        value={asteriskAriEndpoint}
                        onChange={e => setAsteriskAriEndpoint(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">
                        ARI base URL (e.g., http://asterisk.example.com:8088) matching http.conf
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        ARI Username <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. dograh"
                        value={asteriskAppName}
                        onChange={e => setAsteriskAppName(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">
                        ARI username, matching the section name in ari.conf
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-brand-text">
                          App Password <span className="text-rose-700">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="text-[11px] text-brand-accent hover:underline font-medium"
                        >
                          {showToken ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder={status?.telephony?.credentials?.hasSecret ? '••••••••  (Saved)' : 'Enter ARI user password'}
                        value={asteriskAppPassword}
                        onChange={e => setAsteriskAppPassword(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">
                        ARI password defined for this user in ari.conf
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        WebSocket Client Name <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. dograh"
                        value={asteriskWsClientName}
                        onChange={e => setAsteriskWsClientName(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">
                        websocket_client.conf connection name for externalMedia
                      </span>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Dial String Template <span className="text-brand-muted font-normal">(Default: PJSIP/{'{number}'})</span>
                      </label>
                      <input
                        type="text"
                        placeholder="PJSIP/{number}"
                        value={asteriskDialStringTemplate}
                        onChange={e => setAsteriskDialStringTemplate(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">
                        How a dialed number reaches your trunk. <code>{'{number}'}</code> is substituted; or use <code>Local/{'{number}'}@from-internal</code> for FreePBX.
                      </span>
                    </div>
                  </div>

                  {/* Stasis App Name & Dialplan Snippet Display */}
                  {(stasisAppName || status?.telephony?.credentials?.stasisAppName) && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-700 font-bold text-xs uppercase tracking-wider">✨ Stasis Application Name</span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-body font-bold bg-amber-500/20 text-amber-700 border border-amber-500/30">
                            {stasisAppName || status?.telephony?.credentials?.stasisAppName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(stasisAppName || status?.telephony?.credentials?.stasisAppName || '');
                            setCopiedStasis(true);
                            setTimeout(() => setCopiedStasis(false), 2000);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-brand-bg hover:bg-brand-card text-brand-text text-xs font-bold transition flex items-center gap-1.5"
                        >
                          {copiedStasis ? <Icons.Check /> : <Icons.Copy />}
                          {copiedStasis ? 'Copied' : 'Copy Name'}
                        </button>
                      </div>

                      <div>
                        <span className="text-xs font-bold text-brand-text block mb-1">
                          Add to your Asterisk Dialplan (<code>extensions.conf</code>):
                        </span>
                        <pre className="p-3 rounded-lg bg-brand-bg/95 font-mono text-xs text-brand-text border border-brand-border overflow-x-auto select-all">
{`[from-external]
exten => _X.,1,NoOp(Incoming call to \${EXTEN})
 same => n,Stasis(${stasisAppName || status?.telephony?.credentials?.stasisAppName})
 same => n,Hangup()`}
                        </pre>
                      </div>

                      <p className="text-[11px] text-brand-muted">
                        After saving, reload Asterisk dialplan: <code className="text-amber-700">asterisk -rx "dialplan reload"</code>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 🟣 TWILIO FORM */}
              {selectedProvider === 'twilio' && (
                <div className="space-y-4">
                  <div className="border-b border-brand-border pb-3">
                    <h5 className="text-sm font-bold text-brand-text flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-400" /> Twilio Account & Number Details
                    </h5>
                    <p className="text-xs text-brand-muted mt-0.5">
                      Enter your Twilio API credentials to bind your active phone number.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <PhoneInputField
                        label="Twilio Phone Number"
                        required
                        defaultCountry="US"
                        placeholder="e.g. +1 (555) 019-2834"
                        value={twilioPhone}
                        onChange={val => setTwilioPhone(val)}
                        disabled={assigning}
                        helperText="Your Twilio purchased number with country code"
                      />
                      {isNumberAlreadyConnected(twilioPhone) && (
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs flex items-center gap-1.5 mt-2">
                          <span className="font-bold">✓ Already Connected:</span>
                          <span>This number is already active in your connected lines list above.</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Friendly Line Name <span className="text-brand-muted">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Main Inbound Support"
                        value={twilioLabel}
                        onChange={e => setTwilioLabel(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">Internal label for this line</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Account SID <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={twilioSid}
                        onChange={e => setTwilioSid(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">Found on your Twilio Console dashboard (starts with AC)</span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-brand-text">
                          Auth Token <span className="text-rose-700">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="text-[11px] text-brand-accent hover:underline font-medium"
                        >
                          {showToken ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder={status?.telephony?.credentials?.hasSecret ? '•••••••••••••••• (saved)' : 'Enter Twilio Auth Token'}
                        value={twilioToken}
                        onChange={e => setTwilioToken(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">Primary or secondary Auth Token from Twilio Console</span>
                    </div>
                  </div>

                  {/* Twilio Setup Instructions Card */}
                  <div className="p-3.5 rounded-lg bg-brand-card/60 border border-brand-border text-xs text-brand-muted space-y-1.5">
                    <p className="font-bold text-brand-text">Twilio Console Setup (30 seconds):</p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] pl-1">
                      <li>In your Twilio Console, go to <strong>Phone Numbers → Manage → Active Numbers</strong>.</li>
                      <li>Click your number and scroll down to the <strong>Voice Configuration</strong> section.</li>
                      <li>Under <strong>"A CALL COMES IN"</strong>, select <strong>Webhook</strong>, paste the Inbound URL above, and choose <strong>HTTP POST</strong>.</li>
                      <li>Click <strong>Save</strong> in Twilio, then click <strong>"Save & Connect Twilio"</strong> below.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* 🔵 PLIVO FORM */}
              {selectedProvider === 'plivo' && (
                <div className="space-y-4">
                  <div className="border-b border-brand-border pb-3">
                    <h5 className="text-sm font-bold text-brand-text flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Plivo Account & Number Details
                    </h5>
                    <p className="text-xs text-brand-muted mt-0.5">
                      Enter your Plivo Auth ID and Auth Token. Dograh automatically pushes the Answer URL to your Plivo app.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <PhoneInputField
                        label="Plivo Phone Number"
                        required
                        defaultCountry="US"
                        placeholder="e.g. +1 (555) 019-2834"
                        value={plivoPhone}
                        onChange={val => setPlivoPhone(val)}
                        disabled={assigning}
                        helperText="Your active Plivo voice number with country code"
                      />
                      {isNumberAlreadyConnected(plivoPhone) && (
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs flex items-center gap-1.5 mt-2">
                          <span className="font-bold">✓ Already Connected:</span>
                          <span>This number is already active in your connected lines list above.</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Application ID <span className="text-brand-muted">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Leave blank to auto-create"
                        value={plivoAppId}
                        onChange={e => setPlivoAppId(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                      <span className="text-[10px] text-brand-muted mt-1 block">Leave blank for Dograh to auto-create a Plivo App</span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Auth ID <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. MAYW..."
                        value={plivoAuthId}
                        onChange={e => setPlivoAuthId(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-brand-text">
                          Auth Token <span className="text-rose-700">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="text-[11px] text-brand-accent hover:underline font-medium"
                        >
                          {showToken ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder={status?.telephony?.credentials?.hasSecret ? '•••••••••••••••• (saved)' : 'Enter Plivo Auth Token'}
                        value={plivoAuthToken}
                        onChange={e => setPlivoAuthToken(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 🟢 VONAGE FORM */}
              {selectedProvider === 'vonage' && (
                <div className="space-y-4">
                  <div className="border-b border-brand-border pb-3">
                    <h5 className="text-sm font-bold text-brand-text flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" /> Vonage (Nexmo) Credentials
                    </h5>
                    <p className="text-xs text-brand-muted mt-0.5">
                      Connect your Vonage API account with 16kHz audio streaming.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <PhoneInputField
                        label="Vonage Phone Number"
                        required
                        defaultCountry="US"
                        placeholder="e.g. +1 (555) 019-2834"
                        value={vonagePhone}
                        onChange={val => setVonagePhone(val)}
                        disabled={assigning}
                        helperText="Your Vonage virtual number with country code"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Application ID <span className="text-brand-muted">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Vonage Voice App ID"
                        value={vonageAppId}
                        onChange={e => setVonageAppId(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        API Key <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Vonage API Key"
                        value={vonageApiKey}
                        onChange={e => setVonageApiKey(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-brand-text">
                          API Secret <span className="text-rose-700">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="text-[11px] text-brand-accent hover:underline font-medium"
                        >
                          {showToken ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder={status?.telephony?.credentials?.hasSecret ? '•••••••••••••••• (saved)' : 'Enter Vonage API Secret'}
                        value={vonageApiSecret}
                        onChange={e => setVonageApiSecret(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 🟠 TELNYX FORM */}
              {selectedProvider === 'telnyx' && (
                <div className="space-y-4">
                  <div className="border-b border-brand-border pb-3">
                    <h5 className="text-sm font-bold text-brand-text flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Telnyx Call Control Details
                    </h5>
                    <p className="text-xs text-brand-muted mt-0.5">
                      Route incoming Telnyx calls to Dograh's Call Control webhook.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <PhoneInputField
                        label="Telnyx Phone Number"
                        required
                        defaultCountry="US"
                        placeholder="e.g. +1 (555) 019-2834"
                        value={telnyxPhone}
                        onChange={val => setTelnyxPhone(val)}
                        disabled={assigning}
                        helperText="Your Telnyx purchased number with country code"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        Connection ID / Profile ID <span className="text-brand-muted">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Telnyx Connection UUID"
                        value={telnyxConnectionId}
                        onChange={e => setTelnyxConnectionId(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-brand-text mb-1.5">
                        API V2 Key <span className="text-rose-700">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="KEY..."
                        value={telnyxApiKey}
                        onChange={e => setTelnyxApiKey(e.target.value)}
                        disabled={assigning}
                        className="w-full h-10 px-3 rounded-lg bg-brand-card border border-brand-border font-mono text-sm text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 📱 CARRIER CALL FORWARDING */}
              {selectedProvider === 'forwarding' && (
                <div className="space-y-4">
                  <div className="border-b border-brand-border pb-3">
                    <h5 className="text-sm font-bold text-brand-text flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" /> Carrier Call Forwarding (No VoIP account needed)
                    </h5>
                    <p className="text-xs text-brand-muted mt-0.5">
                      Use your existing mobile or business SIM card. Calls will be answered by the AI receptionist when you're busy or away.
                    </p>
                  </div>

                  <div className="max-w-md">
                    <PhoneInputField
                      label="Your Mobile / Office Number"
                      required
                      defaultCountry="IN"
                      placeholder="e.g. 98765 43210 (or enter +country number)"
                      value={forwardingPhone}
                      onChange={val => setForwardingPhone(val)}
                      disabled={assigning}
                      showQuickCountries={true}
                      helperText="The number your customers currently call. Calls will be forwarded to the AI receptionist."
                    />
                    {isNumberAlreadyConnected(forwardingPhone) && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-xs flex items-center gap-2 mt-2">
                        <span className="font-bold">✓ Already Connected:</span>
                        <span>This mobile number is saved and active in your connected lines above. You do not need to re-add it after refresh.</span>
                      </div>
                    )}
                  </div>

                  {/* Carrier Codes & Visual Instructions */}
                  <div className="p-4 rounded-xl bg-brand-card border border-brand-border space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-brand-border">
                      <div>
                        <p className="text-xs font-bold text-brand-text">How to activate forwarding on your phone:</p>
                        <p className="text-[11px] text-brand-muted">
                          Incoming calls to your personal/work phone will automatically route to your AI Receptionist.
                        </p>
                      </div>
                      {status?.phoneNumber ? (
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs font-body font-bold flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>AI Destination: {status.phoneNumber}</span>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[11px]">
                          ⚠️ Connect a virtual line above to generate dial codes
                        </div>
                      )}
                    </div>

                    {/* Loop Warning if forwarding to own number */}
                    {forwardingPhone && status?.phoneNumber && forwardingPhone.replace(/\D/g, '') === status.phoneNumber.replace(/\D/g, '') && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs flex items-start gap-2">
                        <span className="text-base shrink-0">⚠️</span>
                        <span>
                          <strong>Infinite Loop Warning:</strong> Your personal mobile number and the AI destination number cannot be the same. The AI Destination must be a separate cloud receptionist line (e.g., your Twilio virtual number) so your carrier knows where to send your missed calls.
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* Option 1: Fast GSM Dial Codes */}
                      <div className="p-3.5 rounded-xl bg-brand-bg border border-brand-border space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-cyan-700 flex items-center gap-1.5">
                            ⚡ Option 1: Dial Codes (Instant)
                          </span>
                          <span className="text-[10px] text-brand-muted">Works on all GSM carriers</span>
                        </div>
                        <p className="text-[11px] text-brand-muted">
                          Tap <strong>Copy</strong> and paste directly into your phone dialer as a normal call:
                        </p>

                        <div className="space-y-1.5">
                          {/* When Unanswered */}
                          <div className="p-2 bg-brand-card border border-brand-border rounded-lg flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="block text-[11px] font-semibold text-brand-text truncate">
                                ⭐ If you don't answer <span className="text-emerald-700 text-[10px]">(Best)</span>
                              </span>
                              <span className="block font-body text-[11px] text-brand-accent font-bold truncate">
                                *61*{status?.phoneNumber || '<AI_NUMBER>'}#
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(`*61*${status?.phoneNumber || ''}#`)}
                              className="px-2.5 py-1 rounded-md bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent text-[11px] font-bold border border-brand-accent/30 shrink-0 transition"
                            >
                              {copiedCode === `*61*${status?.phoneNumber || ''}#` ? 'Copied!' : 'Copy'}
                            </button>
                          </div>

                          {/* When Busy */}
                          <div className="p-2 bg-brand-card border border-brand-border rounded-lg flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="block text-[11px] font-semibold text-brand-text truncate">
                                If your line is busy
                              </span>
                              <span className="block font-body text-[11px] text-cyan-700 font-bold truncate">
                                *67*{status?.phoneNumber || '<AI_NUMBER>'}#
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(`*67*${status?.phoneNumber || ''}#`)}
                              className="px-2.5 py-1 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 text-[11px] font-bold border border-cyan-500/30 shrink-0 transition"
                            >
                              {copiedCode === `*67*${status?.phoneNumber || ''}#` ? 'Copied!' : 'Copy'}
                            </button>
                          </div>

                          {/* Forward All */}
                          <div className="p-2 bg-brand-card border border-brand-border rounded-lg flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="block text-[11px] font-semibold text-brand-text truncate">
                                Forward 100% of calls (Vacation mode)
                              </span>
                              <span className="block font-body text-[11px] text-brand-muted font-bold truncate">
                                *21*{status?.phoneNumber || '<AI_NUMBER>'}#
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyCode(`*21*${status?.phoneNumber || ''}#`)}
                              className="px-2.5 py-1 rounded-md bg-brand-bg hover:bg-brand-card text-brand-muted hover:text-brand-text text-[11px] font-bold border border-brand-border shrink-0 transition"
                            >
                              {copiedCode === `*21*${status?.phoneNumber || ''}#` ? 'Copied!' : 'Copy'}
                            </button>
                          </div>

                          {/* Cancel */}
                          <div className="p-2 bg-brand-card/50 border border-brand-border/60 rounded-lg flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="block text-[10px] text-brand-muted truncate">
                                Turn off all forwarding anytime:
                              </span>
                              <span className="block font-body text-[11px] text-rose-700 font-bold">
                                ##002#
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyCode('##002#')}
                              className="px-2.5 py-1 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 text-[11px] font-bold border border-rose-500/30 shrink-0 transition"
                            >
                              {copiedCode === '##002#' ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Option 2: Smartphone Settings */}
                      <div className="p-3.5 rounded-xl bg-brand-bg border border-brand-border space-y-3 flex flex-col justify-between">
                        <div>
                          <span className="font-bold text-emerald-700 block mb-2">
                            📱 Option 2: Mobile Operating System Settings
                          </span>
                          <div className="space-y-3">
                            <div className="p-2.5 rounded-lg bg-brand-card border border-brand-border space-y-1">
                              <span className="font-bold text-brand-text text-[11px] flex items-center gap-1.5">
                                🍏 Apple iPhone (iOS)
                              </span>
                              <ol className="text-[11px] text-brand-muted list-decimal list-inside space-y-0.5">
                                <li>Open <strong>Settings ⚙️</strong> → <strong>Phone 📞</strong></li>
                                <li>Tap <strong>Call Forwarding</strong></li>
                                <li>Switch <strong>ON</strong> and enter your AI destination line</li>
                              </ol>
                            </div>

                            <div className="p-2.5 rounded-lg bg-brand-card border border-brand-border space-y-1">
                              <span className="font-bold text-brand-text text-[11px] flex items-center gap-1.5">
                                🤖 Android (Samsung / Pixel / Motorola)
                              </span>
                              <ol className="text-[11px] text-brand-muted list-decimal list-inside space-y-0.5">
                                <li>Open default <strong>Phone App</strong></li>
                                <li>Tap <strong>3 dots menu</strong> → <strong>Settings</strong></li>
                                <li>Select <strong>Supplementary services</strong> (or Calling accounts)</li>
                                <li>Tap <strong>Call forwarding</strong> → <strong>Forward when unanswered</strong></li>
                              </ol>
                            </div>
                          </div>
                        </div>

                        <p className="text-[10px] text-brand-muted italic pt-1">
                          Tip: Forwarding when unanswered lets your phone ring first so you can answer personal calls, while the AI catches any missed customer calls!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Action Button for BYOT */}
              <div className="pt-4 border-t border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTelephonyMode('platform-default');
                      setSelectedProvider('pool');
                    }}
                    className="h-10 px-4 rounded-xl bg-brand-card hover:bg-brand-bg text-brand-muted hover:text-brand-text border border-brand-border text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <span className="text-xs text-brand-muted">
                    Credentials are saved securely in your private workspace.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleSaveProvider}
                  disabled={assigning}
                  className="h-10 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50 self-end sm:self-auto"
                >
                  {assigning ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      {selectedProvider === 'asterisk' ? 'Creating ARI Configuration…' : 'Saving & Binding Line…'}
                    </>
                  ) : (
                    <>
                      <Icons.Check /> {selectedProvider === 'asterisk' ? 'Create Configuration' : `Save & Connect ${byotProviders.find(p => p.id === selectedProvider)?.name}`}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. CALL SAFETY & RATE LIMITS (MANAGED AUTOMATICALLY BY CARRIER TRUNK) ── */}
    </div>
  );
};
