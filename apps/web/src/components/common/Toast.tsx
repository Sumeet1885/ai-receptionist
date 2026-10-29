import React from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { Toast as ToastType } from '../../types';

interface ToastProps {
  toast: ToastType;
  onClose: () => void;
}

const variants = {
  error: { icon: CircleAlert, style: 'border-danger/30 border-l-danger bg-danger-surface text-danger' },
  success: { icon: CircleCheck, style: 'border-success/30 border-l-success bg-success-surface text-success' },
  warning: { icon: TriangleAlert, style: 'border-warning/30 border-l-warning bg-warning-surface text-warning' },
  info: { icon: Info, style: 'border-info/30 border-l-info bg-info-surface text-info' },
};

export const Toast: React.FC<ToastProps> = ({ toast, onClose }: ToastProps) => {
  const { icon: Icon, style } = variants[toast.type];
  const urgent = toast.type === 'error' || toast.type === 'warning';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      aria-atomic="true"
      className={`fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm motion-safe:animate-[toast-bounce_1s_infinite] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] items-start gap-3 rounded-xl border border-l-4 p-4 shadow-lg ${style}`}
    >
      <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words text-sm font-sans font-semibold leading-6 [overflow-wrap:anywhere]">{toast.message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={onClose} className="shrink-0 cursor-pointer rounded-md p-1 opacity-75 transition-opacity hover:bg-black/5 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
};
