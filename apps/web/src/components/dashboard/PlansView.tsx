import React, { useState, useEffect } from 'react';
import { Bot } from '../../types';
import { supabase } from '../../lib/supabaseClient';
import { Icons } from '../common/Icons';
import { RazorpayCheckoutModal } from '../common/RazorpayCheckoutModal';

interface PlansViewProps {
  activeBot: Bot | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const PlansView: React.FC<PlansViewProps> = ({ activeBot, showToast }) => {
  const [loading, setLoading] = useState(true);
  const [totalCalls, setTotalCalls] = useState(0);
  const [shortCallsCount, setShortCallsCount] = useState(0);
  const [burnedMinutes, setBurnedMinutes] = useState(0);
  const [inboundCalls, setInboundCalls] = useState(0);
  const [outboundCalls, setOutboundCalls] = useState(0);
  
  // The user's confirmed active plan is strictly Growth Plan (₹1,299 / mo)
  const activePlanName = 'Growth Plan';
  const activePlanPrice = 1299;
  const baseMinutesQuota = 200;
  
  // Extra top-up minutes purchased (persisted in localStorage)
  const [topupMinutes, setTopupMinutes] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('ai_receptionist_topup_minutes');
      return stored ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [razorpayConfig, setRazorpayConfig] = useState<{
    isOpen: boolean;
    amount: number;
    itemName: string;
    itemDescription?: string;
    onSuccess: (details: { paymentId: string; orderId: string; amount: number }) => void;
  }>({
    isOpen: false,
    amount: 1299,
    itemName: 'Growth Plan Subscription',
    onSuccess: () => {},
  });

  useEffect(() => {
    async function loadCallStats() {
      setLoading(true);
      try {
        let query = supabase
          .from('phone_calls')
          .select('duration_seconds, cost_info');
        if (activeBot?.id) {
          query = query.eq('bot_id', activeBot.id);
        }
        const { data: calls, error } = await query;
        if (error) throw error;

        if (calls) {
          setTotalCalls(calls.length);
          let short = 0;
          let totalMinutes = 0;
          let inb = 0;
          let outb = 0;

          calls.forEach((c: any) => {
            const dur = c.duration_seconds || 0;
            const dir = c.cost_info?.direction;
            if (dir === 'outbound') {
              outb++;
            } else {
              inb++;
            }

            if (dur > 0 && dur < 25) {
              short++;
              totalMinutes += 0.5; // Deducts 0.5 mins (₹4 value)
            } else if (dur >= 25) {
              // 25s to 60s = 1 min; each additional 60s pulse = +1 min
              const mins = Math.max(1, Math.ceil(dur / 60));
              totalMinutes += mins;
            }
          });

          setShortCallsCount(short);
          setBurnedMinutes(totalMinutes);
          setInboundCalls(inb);
          setOutboundCalls(outb);
        }
      } catch (err: any) {
        console.warn('Error loading billing call stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCallStats();
  }, [activeBot?.id]);

  const totalQuota = baseMinutesQuota + topupMinutes;
  const percentageUsed = Math.min(100, Math.round((burnedMinutes / totalQuota) * 100));

  const handlePurchaseTopup = (mins: number, price: number) => {
    setShowTopupModal(false);
    setRazorpayConfig({
      isOpen: true,
      amount: price,
      itemName: `Minute Top-up (+${mins} Mins)`,
      itemDescription: `Adds +${mins} non-expiring minutes to your pool at ₹7/min`,
      onSuccess: (details) => {
        const updated = topupMinutes + mins;
        setTopupMinutes(updated);
        try {
          localStorage.setItem('ai_receptionist_topup_minutes', updated.toString());
        } catch {}
        setRazorpayConfig(prev => ({ ...prev, isOpen: false }));
        showToast(`Razorpay payment ${details.paymentId} verified! Added +${mins} minutes (₹${price}) to your pool.`, 'success');
      },
    });
  };

  const handlePayGrowthPlan = () => {
    setRazorpayConfig({
      isOpen: true,
      amount: 1299,
      itemName: 'Growth Plan Subscription (200 Mins)',
      itemDescription: 'Monthly unified voice minute pool for Inbound & Outbound calls',
      onSuccess: (details) => {
        setRazorpayConfig(prev => ({ ...prev, isOpen: false }));
        showToast(`Razorpay payment ${details.paymentId} verified! Growth Plan renewed for another 30 days.`, 'success');
      },
    });
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* 1. CURRENT USAGE & MINUTES BURNED CARD */}
      <div className="bg-brand-card border border-brand-accent/40 rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border pb-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xl">⚡</span>
              <h3 className="font-display font-extrabold text-brand-text text-lg sm:text-xl">
                Active Subscription & Voice Minutes
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Growth Plan (₹1,299 / month)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 border border-blue-500/30 text-blue-300">
                Sandbox Mode
              </span>
            </div>
            <p className="text-xs text-brand-muted mt-1 font-sans">
              Real-time consumption for {activeBot ? activeBot.businessName : 'All Receptionists'}. Inbound and outbound calls share the same minute pool.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowTopupModal(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono bg-brand-accent text-brand-bg hover:bg-brand-accent-hover transition shadow-sm flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Top-up Minutes</span>
            </button>
            <div className="text-left md:text-right border-l md:border-l-0 pl-3 md:pl-0 border-brand-border">
              <span className="text-[10px] uppercase font-mono font-bold text-brand-muted block">Billed Rate</span>
              <span className="text-lg font-display font-black text-brand-text">
                ₹{activePlanPrice}
                <span className="text-xs font-normal text-brand-muted font-sans"> / mo</span>
              </span>
            </div>
          </div>
        </div>

        {/* Progress & Breakdown */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-center relative z-10">
          {/* Minutes Progress */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-display font-extrabold text-brand-text font-mono">
                  {burnedMinutes.toFixed(1)}
                </span>
                <span className="text-sm font-semibold text-brand-muted font-mono ml-1.5">
                  / {totalQuota} Mins Used
                </span>
                {topupMinutes > 0 && (
                  <span className="ml-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    +{topupMinutes} top-up
                  </span>
                )}
              </div>
              <span className="text-xs font-mono font-bold text-brand-accent">
                {percentageUsed}% Utilized
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 rounded-full bg-brand-bg border border-brand-border overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentageUsed >= 90
                    ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]'
                    : percentageUsed >= 70
                    ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                    : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                }`}
                style={{ width: `${Math.max(4, percentageUsed)}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-brand-muted gap-2 pt-1 font-mono">
              <span className="flex items-center gap-1.5">
                <span>📞 Inbound: {inboundCalls} calls</span>
                <span className="text-brand-border">•</span>
                <span>🚀 Outbound: {outboundCalls} calls</span>
                {shortCallsCount > 0 && (
                  <>
                    <span className="text-brand-border">•</span>
                    <span className="text-brand-accent">&lt;25s: {shortCallsCount} calls (0.5m each)</span>
                  </>
                )}
              </span>
              <span className="text-[11px] text-brand-muted/80">
                Total Connected: {totalCalls} calls
              </span>
            </div>
          </div>

          {/* Billing Rules Pill Box */}
          <div className="bg-brand-bg/60 border border-brand-border rounded-xl p-4 space-y-2 text-xs">
            <span className="text-[10px] uppercase font-bold font-mono text-brand-muted block">
              Active Billing Rules:
            </span>
            <div className="space-y-1.5 font-sans">
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Calls &lt; 25 seconds:</span>
                <span className="font-bold text-brand-text font-mono">0.5 min (₹4 value)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Calls ≥ 25 seconds:</span>
                <span className="font-bold text-brand-text font-mono">1 min / min (₹7 rate)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Overage above plan:</span>
                <span className="font-bold text-amber-400 font-mono">₹7 / min</span>
              </div>
            </div>
            <div className="pt-2 border-t border-brand-border/60 text-[11px] text-emerald-400 font-medium">
              ✓ Inbound & Outbound combined pool
            </div>
          </div>
        </div>
      </div>

      {/* 2. THREE-TIER PLANS COMPARISON */}
      <div>
        <div className="text-center space-y-2 mb-8">
          <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-brand-text">
            Simple, Transparent Voice Plans
          </h2>
          <p className="text-sm text-brand-muted max-w-xl mx-auto font-sans">
            Your active subscription is locked to the <strong>Growth Plan (₹1,299 / month)</strong>. Inbound reception and outbound campaign calling share the unified minute pool.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* TIER 1: STARTER */}
          <div className="bg-brand-card rounded-2xl border border-brand-border hover:border-brand-border/80 transition-all flex flex-col justify-between p-6 sm:p-7 opacity-85 hover:opacity-100 card-hover-glow">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="font-display font-bold text-lg text-brand-text">Starter</h4>
                <span className="text-xs font-mono font-semibold text-brand-muted px-2 py-0.5 rounded bg-brand-bg border border-brand-border">
                  Small Teams
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-display font-black text-brand-text font-mono">₹699</span>
                  <span className="text-sm font-semibold text-brand-muted">/ month</span>
                </div>
                <p className="text-xs text-brand-muted mt-1">₹6.99 per minute included</p>
              </div>

              <div className="p-4 rounded-xl bg-brand-bg/60 border border-brand-border space-y-2">
                <span className="text-xs font-extrabold text-brand-text uppercase font-mono block">
                  100 Call Minutes
                </span>
                <p className="text-xs text-brand-muted leading-relaxed font-sans">
                  Inbound Receptionist & Outbound Telecaller combined pool.
                </p>
              </div>

              <ul className="space-y-2.5 text-xs text-brand-text">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Calls &lt; 25s: <strong>0.5 min deducted</strong> (₹4 equivalent)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Calls ≥ 25s: <strong>1 min / min</strong> (₹7/min rate)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Same price for Inbound & Outbound</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Extra minutes at <strong>₹7 / min</strong></span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-brand-border/60">
              <button
                type="button"
                onClick={() => setShowDowngradeModal(true)}
                className="w-full py-2.5 rounded-xl font-bold text-xs transition shadow-sm bg-brand-bg border border-brand-border hover:border-amber-500/50 text-brand-muted hover:text-amber-300"
              >
                Downgrade to Starter
              </button>
            </div>
          </div>

          {/* TIER 2: GROWTH (CURRENT ACTIVE PLAN) */}
          <div className="bg-brand-card rounded-2xl border-2 border-brand-accent ring-2 ring-brand-accent/30 transition-all flex flex-col justify-between p-6 sm:p-7 relative shadow-xl card-hover-glow">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-emerald-500 text-brand-bg shadow-sm tracking-wider flex items-center gap-1.5">
              <span>●</span>
              <span>Your Active Plan</span>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="font-display font-bold text-lg text-brand-text">Growth</h4>
                <span className="text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40">
                  Active Subscription
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-display font-black text-brand-accent font-mono">₹1,299</span>
                  <span className="text-sm font-semibold text-brand-muted">/ month</span>
                </div>
                <p className="text-xs text-brand-muted mt-1">₹6.49 per minute included (Save ₹100+)</p>
              </div>

              <div className="p-4 rounded-xl bg-brand-accent/10 border border-brand-accent/30 space-y-2">
                <span className="text-xs font-extrabold text-brand-accent uppercase font-mono block">
                  200 Call Minutes Pool
                </span>
                <p className="text-xs text-brand-text leading-relaxed font-sans font-medium">
                  Inbound Receptionist & Outbound Telecaller combined pool.
                </p>
              </div>

              <ul className="space-y-2.5 text-xs text-brand-text">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Calls &lt; 25s: <strong>0.5 min deducted</strong> (₹4 equivalent)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Calls ≥ 25s: <strong>1 min / min</strong> (₹7/min rate)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Same price for Inbound & Outbound</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Extra minutes at <strong>₹7 / min</strong></span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-brand-border/60 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-center flex items-center justify-center gap-1.5 font-mono">
                  <span>✓</span>
                  <span>Active Plan</span>
                </div>
                <button
                  type="button"
                  onClick={handlePayGrowthPlan}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600 hover:text-white transition flex items-center gap-1.5 shadow-sm"
                  title="Simulate Razorpay renewal / payment"
                >
                  <span>💳</span>
                  <span>Pay ₹1,299</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowTopupModal(true)}
                className="w-full py-2 rounded-xl text-xs font-bold bg-brand-accent text-brand-bg hover:bg-brand-accent-hover transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <span>⚡</span>
                <span>Add Extra Minutes (Top-up)</span>
              </button>
            </div>
          </div>

          {/* TIER 3: ENTERPRISE */}
          <div className="bg-brand-card rounded-2xl border border-brand-border hover:border-brand-accent/40 transition-all flex flex-col justify-between p-6 sm:p-7 card-hover-glow">
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="font-display font-bold text-lg text-brand-text">Enterprise</h4>
                <span className="text-xs font-mono font-semibold text-brand-muted px-2 py-0.5 rounded bg-brand-bg border border-brand-border">
                  Volume Scale
                </span>
              </div>

              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-display font-black text-brand-text font-mono">Custom</span>
                </div>
                <p className="text-xs text-brand-muted mt-1">High-volume discounted minute slabs</p>
              </div>

              <div className="p-4 rounded-xl bg-brand-bg/60 border border-brand-border space-y-2">
                <span className="text-xs font-extrabold text-brand-text uppercase font-mono block">
                  500+ Minutes Pool
                </span>
                <p className="text-xs text-brand-muted leading-relaxed font-sans">
                  Unlimited concurrency & pooled minutes across multiple projects and numbers.
                </p>
              </div>

              <ul className="space-y-2.5 text-xs text-brand-text">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Volume discounts below ₹6 / minute</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Dedicated SIP trunks & local PSTN numbers</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Multi-agent workflow orchestration</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Direct phone & WhatsApp enterprise support</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-brand-border/60 space-y-2">
              <a
                href="tel:+917038455063"
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-brand-bg border border-brand-border hover:border-brand-accent/60 text-brand-text transition flex items-center justify-center gap-2 shadow-sm"
              >
                <span>📞</span>
                <span>Call Sales: +91 70384 55063</span>
              </a>
              <a
                href="https://wa.me/917038455063?text=Hi%2C%20I%20am%20interested%20in%20the%20Enterprise%20Voice%20AI%20Receptionist%20Plan"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 rounded-xl text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center justify-center gap-1.5"
              >
                <span>💬</span>
                <span>Chat on WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* DOWNGRADE ALERT MODAL */}
      {showDowngradeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-card border border-brand-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="font-display font-bold text-lg text-brand-text">
                Subscription Downgrade Policy
              </h3>
            </div>
            <p className="text-xs text-brand-muted leading-relaxed">
              Your account is currently active on the <strong>Growth Plan (₹1,299 / month — 200 Minutes)</strong>.
            </p>
            <div className="bg-brand-bg border border-brand-border rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-brand-muted">
                <span>Current Monthly Pool:</span>
                <span className="font-bold text-brand-text font-mono">200 Minutes</span>
              </div>
              <div className="flex justify-between text-brand-muted">
                <span>Starter Plan Pool:</span>
                <span className="font-bold text-amber-400 font-mono">100 Minutes</span>
              </div>
              <div className="flex justify-between text-brand-muted pt-1 border-t border-brand-border/60">
                <span>Billing Cycle Ends:</span>
                <span className="font-bold text-brand-text font-mono">Next Month</span>
              </div>
            </div>
            <p className="text-[11px] text-brand-muted">
              Plan changes cannot be toggled instantly without billing cycle reconciliation. To schedule a downgrade at the end of your cycle or speak with billing support:
            </p>
            <div className="space-y-2 pt-2">
              <a
                href="tel:+917038455063"
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-brand-bg border border-brand-border hover:border-brand-accent text-brand-text transition flex items-center justify-center gap-2"
              >
                <span>📞</span>
                <span>Contact Billing: +91 70384 55063</span>
              </a>
              <button
                type="button"
                onClick={() => setShowDowngradeModal(false)}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-brand-accent text-brand-bg hover:bg-brand-accent-hover transition"
              >
                Keep My Growth Plan (₹1,299)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP-UP MINUTES MODAL */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-card border border-brand-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="font-display font-bold text-lg text-brand-text">
                  Top-up Voice Minutes
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTopupModal(false)}
                className="text-brand-muted hover:text-brand-text text-sm font-mono px-2 py-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-brand-muted">
              Add extra calling minutes to your <strong>Growth Plan pool</strong> at the standard ₹7/minute rate. Minutes never expire across billing cycles.
            </p>

            <div className="space-y-2.5">
              {[
                { mins: 50, price: 350, badge: 'Quick Pack' },
                { mins: 100, price: 700, badge: 'Popular' },
                { mins: 200, price: 1400, badge: 'Best Value' },
              ].map((pack) => (
                <div
                  key={pack.mins}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent/60 transition group cursor-pointer card-hover-glow"
                  onClick={() => handlePurchaseTopup(pack.mins, pack.price)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-sm text-brand-text">
                        +{pack.mins} Minutes
                      </span>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-brand-accent/15 border border-brand-accent/30 text-brand-accent">
                        {pack.badge}
                      </span>
                    </div>
                    <span className="text-[11px] text-brand-muted font-mono">₹7.00 / minute</span>
                  </div>

                  <button
                    type="button"
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono bg-brand-accent text-brand-bg group-hover:bg-brand-accent-hover transition shadow-sm"
                  >
                    Pay ₹{pack.price}
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-brand-border/60 text-center">
              <p className="text-[11px] text-brand-muted">
                Instant activation • Inbound & Outbound pooled • Billed via registered account
              </p>
            </div>
          </div>
        </div>
      )}

      {/* RAZORPAY CHECKOUT MODAL SIMULATOR */}
      <RazorpayCheckoutModal
        isOpen={razorpayConfig.isOpen}
        onClose={() => setRazorpayConfig(prev => ({ ...prev, isOpen: false }))}
        amount={razorpayConfig.amount}
        itemName={razorpayConfig.itemName}
        itemDescription={razorpayConfig.itemDescription}
        onSuccess={razorpayConfig.onSuccess}
      />
    </div>
  );
};
