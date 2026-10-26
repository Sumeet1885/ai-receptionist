import React, { useState, useEffect } from 'react';

interface RazorpayCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  itemName: string;
  itemDescription?: string;
  onSuccess: (paymentDetails: { paymentId: string; orderId: string; amount: number }) => void;
}

export const RazorpayCheckoutModal: React.FC<RazorpayCheckoutModalProps> = ({
  isOpen,
  onClose,
  amount,
  itemName,
  itemDescription,
  onSuccess,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [upiId, setUpiId] = useState('user@okhdfcbank');
  const [paymentState, setPaymentState] = useState<'idle' | 'processing' | 'success'>('idle');
  const [timerSeconds, setTimerSeconds] = useState(580); // 9:40 countdown
  const [paymentId, setPaymentId] = useState('');
  const [orderId, setOrderId] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPaymentState('idle');
      return;
    }
    const interval = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 600));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePay = () => {
    setPaymentState('processing');
    const genPayId = 'pay_' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const genOrderId = 'order_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    setPaymentId(genPayId);
    setOrderId(genOrderId);

    // Simulate authentic Razorpay transaction processing
    setTimeout(() => {
      setPaymentState('success');
      setTimeout(() => {
        onSuccess({
          paymentId: genPayId,
          orderId: genOrderId,
          amount,
        });
      }, 1400);
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-large max-w-[440px] w-full overflow-hidden shadow-floating text-text font-sans flex flex-col">
        <p role="note" className="order-first bg-warning-surface px-5 py-2 text-[11px] font-semibold text-warning">
          Demo checkout · No real payment is processed and no card or UPI account is charged.
        </p>
        {/* Razorpay Brand Header */}
        <div className="bg-info-surface p-5 border-b border-border relative">
          <button
            type="button"
            onClick={onClose}
            disabled={paymentState === 'processing'}
            className="absolute top-4 right-4 text-blue-800/80 hover:text-text transition text-xs font-body bg-surface/70 hover:bg-surface w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
          >
            ✕
          </button>

          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-black text-blue-700 text-xs">
              R
            </div>
            <div>
              <span className="text-[10px] font-body tracking-widest uppercase font-bold text-blue-700 block">
                Razorpay Checkout
              </span>
              <h3 className="text-sm font-bold text-text tracking-wide">
                AI Receptionist Telephony
              </h3>
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-blue-400/20">
            <div>
              <span className="text-[11px] text-blue-800/90 font-medium block">{itemName}</span>
              {itemDescription && (
                <span className="text-[10px] text-blue-700/70 block">{itemDescription}</span>
              )}
            </div>
            <div className="text-right">
              <span className="text-xs text-blue-800/80 font-body block">Amount to Pay</span>
              <span className="text-2xl font-black font-body text-text tracking-tight">
                ₹{amount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-blue-700/80 mt-2 font-body">
            <span className="flex items-center gap-1">
              <span>🔒</span> 256-bit SSL Encryption
            </span>
            <span className="px-1.5 py-0.2 rounded bg-amber-400/20 border border-amber-400/40 text-amber-700 font-bold uppercase text-[9px]">
              Test Mode Simulator
            </span>
          </div>
        </div>

        {/* Payment Body */}
        {paymentState === 'processing' ? (
          <div className="py-16 px-6 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-body font-bold text-blue-700">
                ₹
              </div>
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-text">Contacting Payment Gateway…</h4>
              <p className="text-xs text-slate-700">Securing UPI / Card token with Razorpay & Bank</p>
            </div>
            <div className="text-[11px] font-body text-blue-700 animate-pulse">
              Do not refresh or close this window
            </div>
          </div>
        ) : paymentState === 'success' ? (
          <div className="py-12 px-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-700 text-2xl flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.5)]">
              ✓
            </div>
            <div>
              <h4 className="text-lg font-bold text-text">Payment Successful!</h4>
              <p className="text-xs text-slate-700 mt-1 font-body">
                Payment ID: <span className="text-emerald-700 font-bold">{paymentId}</span>
              </p>
              <p className="text-[11px] text-slate-700 mt-0.5 font-body">
                Order ID: {orderId}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-700 font-body">
              ✓ Quota Updated & Verified Instantly
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Method Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setSelectedMethod('upi')}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                  selectedMethod === 'upi'
                    ? 'bg-blue-600 text-text shadow-sm'
                    : 'text-slate-700 hover:text-text'
                }`}
              >
                <span>📱</span>
                <span>UPI / QR</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod('card')}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                  selectedMethod === 'card'
                    ? 'bg-blue-600 text-text shadow-sm'
                    : 'text-slate-700 hover:text-text'
                }`}
              >
                <span>💳</span>
                <span>Card</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod('netbanking')}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                  selectedMethod === 'netbanking'
                    ? 'bg-blue-600 text-text shadow-sm'
                    : 'text-slate-700 hover:text-text'
                }`}
              >
                <span>🏦</span>
                <span>NetBanking</span>
              </button>
            </div>

            {/* TAB CONTENT 1: UPI / QR */}
            {selectedMethod === 'upi' && (
              <div className="space-y-4">
                {/* Dynamic QR Box */}
                <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-4 text-center space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Scan QR to pay</span>
                    <span className="font-body text-amber-700 font-bold">
                      Expires in {formatTimer(timerSeconds)}
                    </span>
                  </div>

                  {/* QR SVG */}
                  <div className="w-36 h-36 mx-auto bg-white p-2.5 rounded-xl shadow-md flex items-center justify-center relative">
                    <svg viewBox="0 0 100 100" className="w-full h-full text-slate-900 fill-current">
                      {/* Corner 1 */}
                      <rect x="0" y="0" width="30" height="30" rx="3" />
                      <rect x="5" y="5" width="20" height="20" fill="white" />
                      <rect x="10" y="10" width="10" height="10" />
                      {/* Corner 2 */}
                      <rect x="70" y="0" width="30" height="30" rx="3" />
                      <rect x="75" y="5" width="20" height="20" fill="white" />
                      <rect x="80" y="10" width="10" height="10" />
                      {/* Corner 3 */}
                      <rect x="0" y="70" width="30" height="30" rx="3" />
                      <rect x="5" y="75" width="20" height="20" fill="white" />
                      <rect x="10" y="80" width="10" height="10" />
                      {/* Matrix dots */}
                      <rect x="36" y="6" width="8" height="8" />
                      <rect x="50" y="14" width="8" height="8" />
                      <rect x="36" y="24" width="8" height="8" />
                      <rect x="8" y="38" width="8" height="8" />
                      <rect x="22" y="46" width="8" height="8" />
                      <rect x="38" y="38" width="10" height="10" />
                      <rect x="54" y="38" width="8" height="8" />
                      <rect x="68" y="44" width="10" height="8" />
                      <rect x="84" y="38" width="8" height="8" />
                      <rect x="38" y="54" width="8" height="8" />
                      <rect x="54" y="54" width="10" height="10" />
                      <rect x="70" y="60" width="8" height="8" />
                      <rect x="38" y="70" width="8" height="8" />
                      <rect x="50" y="78" width="10" height="8" />
                      <rect x="70" y="74" width="8" height="8" />
                      <rect x="84" y="84" width="8" height="8" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-600 text-white font-body shadow">
                        UPI
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 text-[11px] text-slate-700 font-body">
                    <span>GPay</span>
                    <span>•</span>
                    <span>PhonePe</span>
                    <span>•</span>
                    <span>Paytm</span>
                    <span>•</span>
                    <span>BHIM</span>
                  </div>
                </div>

                {/* VPA Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-700 block">
                    Or Enter UPI ID / VPA
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="mobile@upi or user@okhdfcbank"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handlePay}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition font-body shrink-0"
                    >
                      Verify & Pay
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: CARD */}
            {selectedMethod === 'card' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Card Number</label>
                  <input
                    type="text"
                    readOnly
                    value="4242 •••• •••• 4242"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-text font-body"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 block">Valid Thru</label>
                    <input
                      type="text"
                      readOnly
                      value="12 / 28"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-text font-body"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700 block">CVV</label>
                    <input
                      type="password"
                      readOnly
                      value="123"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-text font-body"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-700">
                  Test card auto-populated for seamless simulation.
                </p>
              </div>
            )}

            {/* TAB CONTENT 3: NETBANKING */}
            {selectedMethod === 'netbanking' && (
              <div className="space-y-3">
                <label className="text-[11px] font-semibold text-slate-700 block">Select Popular Bank</label>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                  {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank'].map((b, i) => (
                    <div
                      key={b}
                      className={`p-2.5 rounded-xl border text-center cursor-pointer transition ${
                        i === 0
                          ? 'border-blue-500 bg-blue-500/10 text-text'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-200'
                      }`}
                    >
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handlePay}
                className="w-full py-3.5 rounded-xl font-display font-extrabold text-sm bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                <span>⚡</span>
                <span>Simulate Pay ₹{amount.toLocaleString('en-IN')} (Success)</span>
              </button>
            </div>

            {/* Footer Trust Bar */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 font-body border-t border-slate-200/80">
              <span>Secured by Razorpay</span>
              <span>PCI-DSS Certified Level 1</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
