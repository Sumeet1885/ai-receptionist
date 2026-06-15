import React from 'react';
import { Toast as ToastType } from '../../types';
import { Icons } from './Icons';

interface ToastProps {
  toast: ToastType;
}

export const Toast: React.FC<ToastProps> = ({ toast }: ToastProps) => {
  return (
    <div className="fixed top-5 right-5 z-50 flex items-center p-4 rounded-xl shadow-2xl bg-brand-card border border-brand-border border-l-4 border-l-brand-accent text-brand-text animate-bounce max-w-sm">
      <div className="text-brand-accent shrink-0">
        <Icons.Bot />
      </div>
      <span className="ml-3 text-sm font-sans font-semibold">{toast.message}</span>
    </div>
  );
};
