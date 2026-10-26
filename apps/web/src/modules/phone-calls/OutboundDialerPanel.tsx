import React, { useState } from 'react';
import { Icons } from '../../components/common/Icons';
import { validateContactInput } from '../../lib/contactValidation';
import { dograhApi } from './dograhApi';
import { PhoneInputField } from '../../components/common/PhoneInputField';

interface OutboundDialerPanelProps {
  botId: string;
  callerId: string | null;
  isProvisioned: boolean;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onCallPlaced?: () => void;
}

interface ErrorDiagnostic {
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  actionType?: 'link' | 'tab';
}

function parseCallError(rawMessage: string): ErrorDiagnostic {
  const msg = rawMessage.toLowerCase();

  if (msg.includes('20003') || msg.includes('status 4') || msg.includes('not active') || msg.includes('balance')) {
    return {
      title: 'Twilio Account Suspended or $0 Balance',
      description: 'Twilio declined to place this call because your account balance is $0.00 or the account is inactive. Top up your balance in Twilio Console to enable outbound dialing.',
      actionText: 'Recharge in Twilio Console ↗',
      actionHref: 'https://console.twilio.com/billing',
      actionType: 'link',
    };
  }

  if (msg.includes('not ready for outbound calls') || msg.includes('need a number to dial from') || msg.includes('add at least one number')) {
    return {
      title: 'Caller ID Phone Number Required',
      description: 'Your outbound carrier line is created, but no phone number has been linked to it yet. Please attach your phone number under Phone Line Setup.',
      actionText: 'Configure Phone Line ➔',
      actionType: 'tab',
    };
  }

  if (msg.includes('already registered under another organization')) {
    return {
      title: 'Phone Number Registered on Another Account',
      description: 'This phone number is already attached to another organization on the voice server. Please use a different number or release it from the other account.',
    };
  }

  if (msg.includes('cooldown') || msg.includes('hourly cap') || msg.includes('rate limit')) {
    return {
      title: 'Call Frequency Rate Limit Active',
      description: 'A cooldown period or hourly call limit is active to prevent accidental spam. Please wait a few moments before trying again.',
    };
  }

  if (msg.includes('timeout') || msg.includes('unreachable') || msg.includes('aborted')) {
    return {
      title: 'Voice Engine Connecting',
      description: 'The telephony engine took too long to respond. The server may be restarting or connecting—please try again in 10-15 seconds.',
    };
  }

  return {
    title: 'Call Placement Issue',
    description: rawMessage.replace(/^Dograh API error on [^:]+:\s*/i, '').replace(/^{"detail":\s*"(.*)"}$/, '$1'),
  };
}

export const OutboundDialerPanel: React.FC<OutboundDialerPanelProps> = ({
  botId,
  callerId,
  isProvisioned,
  showToast,
  onCallPlaced,
}) => {
  const [dialNumber, setDialNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [dialTouched, setDialTouched] = useState(false);
  const [calling, setCalling] = useState(false);
  const [lastCallResult, setLastCallResult] = useState<string | null>(null);
  const [errorDiagnostic, setErrorDiagnostic] = useState<ErrorDiagnostic | null>(null);

  const dialValidation = validateContactInput('phone', dialNumber);

  const handleCallOut = async () => {
    setDialTouched(true);
    if (!dialValidation.valid || !dialValidation.normalized) {
      showToast(dialValidation.error || 'Please enter a valid phone number with country code', 'error');
      return;
    }

    if (!callerId) {
      showToast('Please connect a phone number first in the Telephony Setup tab.', 'error');
      return;
    }

    setCalling(true);
    setLastCallResult(null);
    setErrorDiagnostic(null);
    try {
      await dograhApi.callOut(botId, dialValidation.normalized, contactName.trim() || undefined);
      showToast(`Outbound call dispatched to ${contactName ? `${contactName} (${dialValidation.normalized})` : dialValidation.normalized}!`, 'success');
      setLastCallResult(`Call dispatched to ${contactName ? `${contactName} (${dialValidation.normalized})` : dialValidation.normalized}. Phone should ring shortly.`);
      setDialNumber('');
      setContactName('');
      setDialTouched(false);
      onCallPlaced?.();
    } catch (err: any) {
      const diagnostic = parseCallError(err.message || 'Call failed');
      setErrorDiagnostic(diagnostic);
      showToast(diagnostic.title, 'error');
    } finally {
      setCalling(false);
    }
  };

  const dialPadButtons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  const handlePadClick = (val: string) => {
    setDialNumber(prev => (prev || '') + val);
    setDialTouched(false);
  };

  const handleBackspace = () => {
    setDialNumber(prev => (prev ? prev.slice(0, -1) : ''));
    setDialTouched(false);
  };

  const handleClear = () => {
    setDialNumber('');
    setContactName('');
    setDialTouched(false);
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-5 lg:p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-brand-border">
        <div>
          <h3 className="text-lg font-display font-extrabold text-brand-text flex items-center gap-2">
            <span>📞 Live Test Call (AI Dials Your Phone)</span>
          </h3>
          <p className="text-xs text-brand-muted mt-1">
            Enter your mobile number below and click "Call My Phone Now". Your phone will ring in seconds so you can talk to your AI receptionist live.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-border text-xs">
          <span className="text-brand-muted">Caller ID Line:</span>
          <span className="font-mono font-bold text-emerald-400">
            {callerId || 'No Number Linked'}
          </span>
        </div>
      </div>

      {!callerId ? (
        <div className="p-8 text-center rounded-xl bg-brand-bg border border-dashed border-brand-border space-y-3">
          <div className="w-12 h-12 rounded-full bg-brand-card border border-brand-border text-brand-muted flex items-center justify-center mx-auto text-xl">
            📞
          </div>
          <h4 className="text-sm font-bold text-brand-text">No Outbound Line Configured</h4>
          <p className="text-xs text-brand-muted max-w-md mx-auto">
            To place a test call, first connect your phone number in the <strong>📥 Incoming Calls (Customers Call You)</strong> tab above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          {/* Main Dial Form */}
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-brand-bg/60 border border-brand-border space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">
                  Contact / Customer Name <span className="text-brand-muted font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  disabled={calling}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-brand-card border border-brand-border text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent transition"
                />
                <p className="text-[11px] text-brand-muted mt-1">
                  The AI receptionist will know who it is speaking to, and any scheduled visit or lead will be saved with this name.
                </p>
              </div>

              <PhoneInputField
                label="Destination Phone Number to Ring"
                description="Select your country code and enter your mobile number. The AI receptionist will ring this phone directly."
                placeholder="e.g. 98765 43210 (or enter +country number)"
                value={dialNumber}
                onChange={val => {
                  setDialNumber(val);
                  setDialTouched(false);
                }}
                defaultCountry="IN"
                showQuickCountries={true}
                disabled={calling}
                required
                error={dialTouched && !dialValidation.valid && dialNumber ? dialValidation.error : null}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCallOut}
                disabled={calling || !dialNumber}
                className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50 active:scale-95"
              >
                {calling ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Calling Your Phone…
                  </>
                ) : (
                  <>
                    <span>📞</span> Call My Phone Now
                  </>
                )}
              </button>

              {dialNumber && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-11 px-4 rounded-xl bg-brand-bg hover:bg-brand-card text-brand-muted hover:text-brand-text border border-brand-border text-xs transition"
                >
                  Clear Number
                </button>
              )}
            </div>

            {/* Success Notification Banner */}
            {lastCallResult && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-brand-text flex items-start gap-3 animate-in fade-in">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold">
                  ✓
                </span>
                <div className="space-y-0.5">
                  <p className="font-bold text-emerald-300">Call Dispatched Successfully</p>
                  <p className="text-brand-muted">{lastCallResult}</p>
                </div>
              </div>
            )}

            {/* Smart Actionable Error Diagnostic Banner */}
            {errorDiagnostic && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠️</span>
                  <div className="space-y-1">
                    <h5 className="font-bold text-amber-300 text-xs tracking-tight">
                      {errorDiagnostic.title}
                    </h5>
                    <p className="text-brand-text leading-relaxed text-[11px]">
                      {errorDiagnostic.description}
                    </p>
                  </div>
                </div>

                {errorDiagnostic.actionText && errorDiagnostic.actionHref && (
                  <div className="pt-1 pl-6">
                    <a
                      href={errorDiagnostic.actionHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-[11px] font-bold transition"
                    >
                      <span>{errorDiagnostic.actionText}</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Test Tips */}
            <div className="p-4 rounded-xl bg-brand-bg/70 border border-brand-border text-xs text-brand-muted space-y-2">
              <p className="font-bold text-brand-text">What happens during this test call?</p>
              <ul className="space-y-1.5 text-[11px] list-disc list-inside">
                <li>Dograh initiates an outbound PSTN call from your assigned caller ID (<strong>{callerId}</strong>).</li>
                <li>When you answer, the AI receptionist introduces itself according to your bot persona and business knowledge base.</li>
                <li>Try asking questions about your services, booking an appointment, or testing qualification questions.</li>
                <li>After you hang up, the full audio recording, transcript, and lead scoring will appear in the <strong>Call Logs</strong> tab.</li>
              </ul>
            </div>
          </div>

          {/* Quick Dial Pad Graphic */}
          <div className="p-5 rounded-xl bg-brand-bg border border-brand-border space-y-4">
            <div className="text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                Interactive Dial Pad
              </span>
              <div className="mt-1 h-9 px-3 rounded-lg bg-brand-card border border-brand-border flex items-center justify-center">
                <span className="text-sm font-mono font-bold text-brand-text truncate">
                  {dialNumber || '---'}
                </span>
              </div>
              <span className="text-[10px] text-brand-muted/70 mt-1 block">
                Click keypad digits or type directly in the number box
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {dialPadButtons.map(btn => (
                <button
                  key={btn}
                  type="button"
                  onClick={() => handlePadClick(btn)}
                  disabled={calling}
                  className="h-11 rounded-lg bg-brand-card hover:bg-brand-accent/20 hover:text-brand-accent border border-brand-border text-sm font-bold text-brand-text transition flex items-center justify-center active:scale-95 disabled:opacity-50"
                >
                  {btn}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                disabled={calling || !dialNumber}
                className="h-11 rounded-lg bg-brand-card hover:bg-rose-500/20 hover:text-rose-400 border border-brand-border text-xs font-bold text-brand-muted transition flex items-center justify-center active:scale-95 disabled:opacity-50"
                title="Clear all digits"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handlePadClick('+')}
                disabled={calling}
                className="h-11 rounded-lg bg-brand-card hover:bg-brand-accent/20 hover:text-brand-accent border border-brand-border text-sm font-bold text-brand-text transition flex items-center justify-center active:scale-95 disabled:opacity-50"
                title="Add plus sign"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                disabled={calling || !dialNumber}
                className="h-11 rounded-lg bg-brand-card hover:bg-amber-500/20 hover:text-amber-400 border border-brand-border text-sm font-bold text-brand-muted transition flex items-center justify-center active:scale-95 disabled:opacity-50"
                title="Backspace (delete last digit)"
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
