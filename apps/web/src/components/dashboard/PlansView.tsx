import React, { useState, useEffect } from 'react';
import { Bot } from '../../types';
import { supabase } from '../../lib/supabaseClient';
import { Icons } from '../common/Icons';
import { RazorpayCheckoutModal } from '../common/RazorpayCheckoutModal';
import { PricingView } from '../billing/PricingView';

interface PlansViewProps {
  activeBot: Bot | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  navigate?: (path: string) => void;
}

export const PlansView: React.FC<PlansViewProps> = ({ activeBot, showToast, navigate }) => {
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
              <span className="px-2.5 py-0.5 rounded-full text-xs font-body font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Active Voice Minutes Pool
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-body bg-blue-500/10 border border-blue-500/30 text-blue-700">
                Live
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
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold font-body bg-brand-accent text-primary-foreground hover:bg-brand-accent-hover hover:text-primary-foreground transition shadow-sm flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Top-up Minutes</span>
            </button>
            <div className="text-left md:text-right border-l md:border-l-0 pl-3 md:pl-0 border-brand-border">
              <span className="text-[10px] uppercase font-body font-bold text-brand-muted block">Status</span>
              <span className="text-sm font-display font-bold text-emerald-700">
                Active Pool
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
                <span className="text-3xl font-display font-extrabold text-brand-text font-body">
                  {burnedMinutes.toFixed(1)}
                </span>
                <span className="text-sm font-semibold text-brand-muted font-body ml-1.5">
                  / {totalQuota} Mins Used
                </span>
                {topupMinutes > 0 && (
                  <span className="ml-2 text-xs font-body text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    +{topupMinutes} top-up
                  </span>
                )}
              </div>
              <span className="text-xs font-body font-bold text-brand-accent">
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

            <div className="flex flex-wrap items-center justify-between text-xs text-brand-muted gap-2 pt-1 font-body">
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
            <span className="text-[10px] uppercase font-bold font-body text-brand-muted block">
              Active Billing Rules:
            </span>
            <div className="space-y-1.5 font-sans">
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Calls &lt; 25 seconds:</span>
                <span className="font-bold text-brand-text font-body">0.5 min (₹4 value)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Calls ≥ 25 seconds:</span>
                <span className="font-bold text-brand-text font-body">1 min / min (₹7 rate)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Overage above plan:</span>
                <span className="font-bold text-amber-700 font-body">₹7 / min</span>
              </div>
            </div>
            <div className="pt-2 border-t border-brand-border/60 text-[11px] text-emerald-700 font-medium">
              ✓ Inbound & Outbound combined pool
            </div>
          </div>
        </div>
      </div>

      {/* 2. REAL SUBSCRIPTION PLANS (SYNCED WITH SUPABASE & RAZORPAY) */}
      <div className="pt-2">
        <PricingView navigate={navigate || (() => {})} embedded={true} />
      </div>

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
                className="text-brand-muted hover:text-brand-text text-sm font-body px-2 py-1"
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
                      <span className="text-[10px] font-body font-bold px-1.5 py-0.2 rounded bg-brand-accent/15 border border-brand-accent/30 text-brand-accent">
                        {pack.badge}
                      </span>
                    </div>
                    <span className="text-[11px] text-brand-muted font-body">₹7.00 / minute</span>
                  </div>

                  <button
                    type="button"
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold font-body bg-brand-accent text-primary-foreground group-hover:bg-brand-accent-hover transition shadow-sm"
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
