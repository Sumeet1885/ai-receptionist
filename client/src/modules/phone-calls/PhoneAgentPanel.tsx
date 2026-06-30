import React, { useCallback, useEffect, useState } from 'react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Icons } from '../../components/common/Icons';
import { validateContactInput } from '../../lib/contactValidation';
import { dograhApi, DograhNumber, PhoneAgentStatus } from './dograhApi';

interface PhoneAgentPanelProps {
  botId: string;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const PhoneAgentPanel: React.FC<PhoneAgentPanelProps> = ({ botId, showToast }) => {
  const [status, setStatus] = useState<PhoneAgentStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [numbers, setNumbers] = useState<DograhNumber[]>([]);
  const [selectedNumberKey, setSelectedNumberKey] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [dialNumber, setDialNumber] = useState('');
  const [dialTouched, setDialTouched] = useState(false);
  const [calling, setCalling] = useState(false);
  const [outboundCooldownInput, setOutboundCooldownInput] = useState('');
  const [outboundHourlyCapInput, setOutboundHourlyCapInput] = useState('');
  const [savingOutboundRateLimit, setSavingOutboundRateLimit] = useState(false);
  const [inboundCooldownInput, setInboundCooldownInput] = useState('');
  const [inboundHourlyCapInput, setInboundHourlyCapInput] = useState('');
  const [savingInboundRateLimit, setSavingInboundRateLimit] = useState(false);

  const dialValidation = validateContactInput('phone', dialNumber);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await dograhApi.getStatus(botId);
      setStatus(data);
      setOutboundCooldownInput(String(data.outboundCooldownSeconds));
      setOutboundHourlyCapInput(String(data.outboundHourlyCap));
      setInboundCooldownInput(String(data.inboundCooldownSeconds));
      setInboundHourlyCapInput(String(data.inboundHourlyCap));
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
      if (assigned) setSelectedNumberKey(`${assigned.telephonyConfigId}:${assigned.phoneNumberId}`);
    } catch (err: any) {
      showToast(err.message || 'Could not load available phone numbers', 'error');
    }
  }, [botId, showToast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.provisioned) void loadNumbers();
  }, [status?.provisioned, loadNumbers]);

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      await dograhApi.provision(botId);
      showToast('Phone agent provisioned.', 'success');
      await loadStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to provision the phone agent', 'error');
    } finally {
      setProvisioning(false);
    }
  };

  const handleAssign = async () => {
    const [configId, numberId] = selectedNumberKey.split(':').map(Number);
    if (!configId || !numberId) return;
    setAssigning(true);
    try {
      const result = await dograhApi.assignNumber(botId, configId, numberId);
      showToast(`Number ${result.phoneNumber} assigned.`, 'success');
      await loadStatus();
      await loadNumbers();
    } catch (err: any) {
      showToast(err.message || 'Failed to assign the phone number', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleSaveOutboundRateLimit = async () => {
    const cooldownSeconds = Number(outboundCooldownInput);
    const hourlyCap = Number(outboundHourlyCapInput);
    if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 0 || !Number.isFinite(hourlyCap) || hourlyCap < 1) {
      showToast('Enter a valid cooldown (0+ seconds) and hourly cap (1+).', 'error');
      return;
    }
    setSavingOutboundRateLimit(true);
    try {
      const result = await dograhApi.updateOutboundRateLimit(botId, cooldownSeconds, hourlyCap);
      setStatus(prev => prev ? { ...prev, outboundCooldownSeconds: result.outboundCooldownSeconds, outboundHourlyCap: result.outboundHourlyCap } : prev);
      showToast('Outbound call limit updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update the rate limit', 'error');
    } finally {
      setSavingOutboundRateLimit(false);
    }
  };

  const handleSaveInboundRateLimit = async () => {
    const cooldownSeconds = Number(inboundCooldownInput);
    const hourlyCap = Number(inboundHourlyCapInput);
    if (!Number.isFinite(cooldownSeconds) || cooldownSeconds < 0 || !Number.isFinite(hourlyCap) || hourlyCap < 1) {
      showToast('Enter a valid cooldown (0+ seconds) and hourly cap (1+).', 'error');
      return;
    }
    setSavingInboundRateLimit(true);
    try {
      const result = await dograhApi.updateInboundRateLimit(botId, cooldownSeconds, hourlyCap);
      setStatus(prev => prev ? { ...prev, inboundCooldownSeconds: result.inboundCooldownSeconds, inboundHourlyCap: result.inboundHourlyCap } : prev);
      showToast('Inbound call limit updated.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update the rate limit', 'error');
    } finally {
      setSavingInboundRateLimit(false);
    }
  };

  const handleCallOut = async () => {
    setDialTouched(true);
    if (!dialValidation.valid) return;
    setCalling(true);
    try {
      await dograhApi.callOut(botId, dialValidation.normalized);
      showToast('Call placed. It will appear in the call history shortly.', 'success');
      setDialNumber('');
      setDialTouched(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to place the call', 'error');
    } finally {
      setCalling(false);
    }
  };

  return (
    <section className="bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 sm:px-6 py-4 border-b border-brand-border flex items-center justify-between gap-3 bg-brand-bg/40">
        <div>
          <h3 className="font-display font-bold text-brand-text text-lg flex items-center gap-2">
            <Icons.Bot /> Phone Agent
          </h3>
          <p className="text-xs text-brand-muted mt-1">Answer inbound calls with a Dograh voice agent built from this receptionist's knowledge base.</p>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-4">
        {loadingStatus ? (
          <p className="text-sm text-brand-muted animate-pulse">Checking phone agent status…</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${status?.provisioned ? 'bg-brand-success/10 border-brand-success/30 text-brand-success' : 'bg-brand-bg border-brand-border text-brand-muted'}`}>
                {status?.provisioned ? <Icons.Check /> : <Icons.Bot />}
              </div>
              <div>
                <p className="text-sm font-bold text-brand-text">
                  {status?.provisioned ? 'Phone agent provisioned' : 'Phone agent not provisioned'}
                </p>
                <p className="text-xs text-brand-muted mt-0.5">
                  {status?.phoneNumber ? `Assigned number: ${status.phoneNumber}` : 'No number assigned yet.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleProvision}
              disabled={provisioning}
              className="h-10 px-4 rounded-lg bg-brand-accent hover:bg-brand-accent-hover text-brand-bg text-xs font-bold disabled:opacity-50"
            >
              {provisioning ? 'Provisioning…' : status?.provisioned ? 'Re-provision phone agent' : 'Provision phone agent'}
            </button>

            {status?.provisioned && (
              <div className="pt-4 border-t border-brand-border flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <select
                  value={selectedNumberKey}
                  onChange={e => setSelectedNumberKey(e.target.value)}
                  className="h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text flex-1"
                >
                  <option value="">Select an unassigned number…</option>
                  {numbers.map(n => (
                    <option key={`${n.telephonyConfigId}:${n.phoneNumberId}`} value={`${n.telephonyConfigId}:${n.phoneNumberId}`}>
                      {n.address} {n.isAssignedToThisBot ? '(current)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={assigning || !selectedNumberKey}
                  className="h-10 px-4 rounded-lg bg-brand-card border border-brand-border hover:border-brand-accent/60 text-brand-text text-xs font-bold disabled:opacity-50"
                >
                  {assigning ? 'Assigning…' : 'Assign number'}
                </button>
              </div>
            )}

            {status?.outboundProvisioned && status?.phoneNumber && (
              <div className="pt-4 border-t border-brand-border space-y-2">
                <p className="text-xs text-brand-muted">Place an outbound call from {status.phoneNumber}. The agent introduces itself generically — it doesn't yet know who it's calling or why.</p>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <div className="voice-phone-card flex-1">
                    <PhoneInput
                      defaultCountry="IN"
                      placeholder="Enter phone number"
                      value={dialNumber}
                      onChange={val => {
                        setDialNumber(val || '');
                        setDialTouched(false);
                      }}
                      disabled={calling}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCallOut}
                    disabled={calling || !dialNumber}
                    className="h-10 px-4 rounded-lg bg-brand-accent hover:bg-brand-accent-hover text-brand-bg text-xs font-bold disabled:opacity-50 shrink-0"
                  >
                    {calling ? 'Calling…' : 'Call a number'}
                  </button>
                </div>
                {dialTouched && !dialValidation.valid && dialNumber && (
                  <p className="text-xs text-brand-danger">{dialValidation.error}</p>
                )}
              </div>
            )}

            {status?.provisioned && status?.phoneNumber && (
              <div className="pt-4 border-t border-brand-border space-y-2">
                <p className="text-xs text-brand-muted">
                  Limit how often this number can receive inbound calls. Once the limit is hit, calls still
                  connect briefly, but the agent immediately says the line is at capacity and ends the call
                  rather than a normal conversation (there's no way to refuse a call before it rings).
                </p>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <label className="flex-1 flex items-center gap-2 text-xs text-brand-muted">
                    Cooldown (seconds)
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={inboundCooldownInput}
                      onChange={e => setInboundCooldownInput(e.target.value)}
                      className="h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text w-24"
                    />
                  </label>
                  <label className="flex-1 flex items-center gap-2 text-xs text-brand-muted">
                    Max calls / hour
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={inboundHourlyCapInput}
                      onChange={e => setInboundHourlyCapInput(e.target.value)}
                      className="h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text w-24"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveInboundRateLimit}
                    disabled={savingInboundRateLimit}
                    className="h-10 px-4 rounded-lg bg-brand-card border border-brand-border hover:border-brand-accent/60 text-brand-text text-xs font-bold disabled:opacity-50 shrink-0"
                  >
                    {savingInboundRateLimit ? 'Saving…' : 'Save limit'}
                  </button>
                </div>
              </div>
            )}

            {status?.outboundProvisioned && status?.phoneNumber && (
              <div className="pt-4 border-t border-brand-border space-y-2">
                <p className="text-xs text-brand-muted">Limit how often this number can place outbound calls.</p>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <label className="flex-1 flex items-center gap-2 text-xs text-brand-muted">
                    Cooldown (seconds)
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={outboundCooldownInput}
                      onChange={e => setOutboundCooldownInput(e.target.value)}
                      className="h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text w-24"
                    />
                  </label>
                  <label className="flex-1 flex items-center gap-2 text-xs text-brand-muted">
                    Max calls / hour
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={outboundHourlyCapInput}
                      onChange={e => setOutboundHourlyCapInput(e.target.value)}
                      className="h-10 px-3 rounded-lg bg-brand-bg border border-brand-border text-sm text-brand-text w-24"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSaveOutboundRateLimit}
                    disabled={savingOutboundRateLimit}
                    className="h-10 px-4 rounded-lg bg-brand-card border border-brand-border hover:border-brand-accent/60 text-brand-text text-xs font-bold disabled:opacity-50 shrink-0"
                  >
                    {savingOutboundRateLimit ? 'Saving…' : 'Save limit'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
