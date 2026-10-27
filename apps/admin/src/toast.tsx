import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { BellRing, CheckCircle2, X } from 'lucide-react';

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: 'info' | 'success';
  action?: { label: string; onClick: () => void };
}

type ShowToast = (toast: Omit<Toast, 'id'>) => void;

const ToastContext = createContext<ShowToast>(() => undefined);
export const useToast = () => useContext(ToastContext);

// Short two-note chime for new requests (Web Audio; silently skipped where unavailable).
export function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // audio is optional
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>((toast) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-3), { ...toast, id }]);
    window.setTimeout(() => dismiss(id), 9000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex animate-toast-in gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${toast.tone === 'success' ? 'bg-success-surface text-success' : 'bg-lime-soft text-primary'}`}>
              {toast.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-xs text-subtle">{toast.description}</p>}
              {toast.action && (
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-primary hover:underline"
                  onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button type="button" aria-label="Dismiss" className="self-start rounded-lg p-1 text-subtle hover:bg-background" onClick={() => dismiss(toast.id)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
