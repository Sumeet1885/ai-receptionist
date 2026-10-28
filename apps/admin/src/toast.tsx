import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, CheckCircle2, CircleAlert, TriangleAlert, X } from 'lucide-react';

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: 'info' | 'success' | 'error' | 'warning';
  action?: { label: string; onClick: () => void };
}

type ShowToast = (toast: Omit<Toast, 'id'>) => void;

const ToastContext = createContext<ShowToast>(() => undefined);
export const useToast = () => useContext(ToastContext);

// Short two-note chime for new requests (Web Audio; silently skipped where unavailable).
export function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  const show = useCallback<ShowToast>(
    (toast) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 9000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="admin-toast-stack pointer-events-none fixed right-4 top-4 z-[120] flex max-h-[calc(100dvh-2rem)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === 'error' || toast.tone === 'warning' ? 'alert' : 'status'}
              aria-atomic="true"
              className={`pointer-events-auto flex shrink-0 motion-safe:animate-[toast-bounce_1s_infinite] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] gap-3 rounded-2xl border border-l-4 p-4 shadow-card ${toast.tone === 'error' ? 'border-danger/30 border-l-danger bg-danger-surface text-danger' : toast.tone === 'warning' ? 'border-warning/30 border-l-warning bg-warning-surface text-warning' : toast.tone === 'success' ? 'border-success/30 border-l-success bg-success-surface text-success' : 'border-info/30 border-l-info bg-info-surface text-info'}`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${toast.tone === 'error' ? 'bg-danger/10 text-danger' : toast.tone === 'warning' ? 'bg-warning/10 text-warning' : toast.tone === 'success' ? 'bg-success/10 text-success' : 'bg-info/10 text-info'}`}
              >
                {toast.tone === 'error' ? (
                  <CircleAlert className="h-4 w-4" />
                ) : toast.tone === 'warning' ? (
                  <TriangleAlert className="h-4 w-4" />
                ) : toast.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <BellRing className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 break-words text-xs opacity-90 [overflow-wrap:anywhere]">
                    {toast.description}
                  </p>
                )}
                {toast.action && (
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                    onClick={() => {
                      toast.action!.onClick();
                      dismiss(toast.id);
                    }}
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="self-start rounded-lg p-1 text-subtle hover:bg-background"
                onClick={() => dismiss(toast.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
