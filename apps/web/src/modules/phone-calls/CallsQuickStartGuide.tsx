import React, { useState } from 'react';
import { Icons } from '../../components/common/Icons';

interface CallsQuickStartGuideProps {
  isProvisioned: boolean;
  hasInboundNumber: boolean;
  hasPlacedCall: boolean;
  phoneNumber: string | null;
  onProvision: () => Promise<void>;
  onNavigateTab: (tab: 'incoming' | 'outgoing' | 'logs') => void;
  onNavigateOutgoingSubTab?: (subTab: 'single' | 'bulk') => void;
}

export const CallsQuickStartGuide: React.FC<CallsQuickStartGuideProps> = ({
  isProvisioned,
  hasInboundNumber,
  hasPlacedCall,
  phoneNumber,
  onProvision,
  onNavigateTab,
  onNavigateOutgoingSubTab,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const stepsDone = (isProvisioned ? 1 : 0) + (hasInboundNumber ? 1 : 0) + (hasPlacedCall ? 1 : 0);
  const isAllComplete = stepsDone === 3;

  const handleProvisionClick = async () => {
    setProvisioning(true);
    try {
      await onProvision();
    } finally {
      setProvisioning(false);
    }
  };

  const handleTestCallClick = () => {
    onNavigateTab('outgoing');
    onNavigateOutgoingSubTab?.('single');
  };

  const handleLineClick = () => {
    onNavigateTab('incoming');
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-4 lg:p-5 shadow-sm space-y-4">
      {/* Header with Progress */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-accent/15 border border-brand-accent/30 text-brand-accent flex items-center justify-center font-bold text-base">
            🚀
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-brand-text">
                Quick Start: Get Your AI Receptionist Live in 3 Steps
              </h4>
              {isAllComplete && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                  🎉 Ready & Tested
                </span>
              )}
            </div>
            <p className="text-xs text-brand-muted mt-0.5">
              {stepsDone} of 3 steps completed ({Math.round((stepsDone / 3) * 100)}%)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(prev => !prev)}
          className="text-xs text-brand-muted hover:text-brand-text transition flex items-center gap-1.5 self-end sm:self-auto"
        >
          <span>{collapsed ? 'Show Checklist ▼' : 'Minimize ▲'}</span>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 rounded-full bg-brand-bg overflow-hidden border border-brand-border/40">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-brand-accent transition-all duration-500 rounded-full"
          style={{ width: `${(stepsDone / 3) * 100}%` }}
        />
      </div>

      {/* Checklist Cards */}
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Step 1 */}
          <div className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-3 ${
            isProvisioned
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-brand-bg/60 border-brand-border'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Step 1</span>
                {isProvisioned ? (
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 text-[10px] font-bold flex items-center justify-center">✓</span>
                ) : (
                  <span className="w-5 h-5 rounded-full bg-brand-card text-brand-muted border border-brand-border text-[10px] font-bold flex items-center justify-center">1</span>
                )}
              </div>
              <h5 className="text-xs font-bold text-brand-text">Provision Voice Engine</h5>
              <p className="text-[11px] text-brand-muted">
                Compiles your AI receptionist persona and knowledge into live voice workflows.
              </p>
            </div>

            {isProvisioned ? (
              <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                <span>✓</span> Engine Active
              </span>
            ) : (
              <button
                type="button"
                onClick={handleProvisionClick}
                disabled={provisioning}
                className="h-8 px-3 rounded-lg bg-brand-accent text-primary-foreground hover:bg-brand-accent-hover hover:text-primary-foreground text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {provisioning ? 'Provisioning…' : '⚡ 1-Click Provision'}
              </button>
            )}
          </div>

          {/* Step 2 */}
          <div className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-3 ${
            hasInboundNumber
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-brand-bg/60 border-brand-border'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Step 2</span>
                {hasInboundNumber ? (
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 text-[10px] font-bold flex items-center justify-center">✓</span>
                ) : (
                  <span className="w-5 h-5 rounded-full bg-brand-card text-brand-muted border border-brand-border text-[10px] font-bold flex items-center justify-center">2</span>
                )}
              </div>
              <h5 className="text-xs font-bold text-brand-text">Set Receptionist Phone</h5>
              <p className="text-[11px] text-brand-muted">
                Choose the number where customers dial in (instant default line or custom provider).
              </p>
            </div>

            {hasInboundNumber ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-body font-bold text-emerald-700 truncate">
                  {phoneNumber}
                </span>
                <button
                  type="button"
                  onClick={handleLineClick}
                  className="text-[10px] text-brand-muted hover:text-brand-text underline"
                >
                  Manage
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleLineClick}
                className="h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>📞</span> Activate Line
              </button>
            )}
          </div>

          {/* Step 3 */}
          <div className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-3 ${
            hasPlacedCall
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-brand-bg/60 border-brand-border'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">Step 3</span>
                {hasPlacedCall ? (
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 text-[10px] font-bold flex items-center justify-center">✓</span>
                ) : (
                  <span className="w-5 h-5 rounded-full bg-brand-card text-brand-muted border border-brand-border text-[10px] font-bold flex items-center justify-center">3</span>
                )}
              </div>
              <h5 className="text-xs font-bold text-brand-text">Place a Live Test Call</h5>
              <p className="text-[11px] text-brand-muted">
                Ring your personal mobile phone and talk live with your AI receptionist.
              </p>
            </div>

            {hasPlacedCall ? (
              <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                <span>✓</span> Tested & Verified
              </span>
            ) : (
              <button
                type="button"
                onClick={handleTestCallClick}
                className="h-8 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-black text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>📱</span> Call My Phone
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
