import React from 'react';
import { BrandLogo } from '../ui/brand-logo';
import { openSupport } from '../../lib/supportDrawer';

interface FooterProps {
  showToast: (message: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ showToast }: FooterProps) => {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-border bg-background px-[5%] py-6 text-xs text-text-subtle md:flex-row">
      <div className="flex flex-col items-center gap-2 md:flex-row md:gap-4">
        <BrandLogo className="h-7" />
        <p className="text-center md:text-left">© 2026 Bolega India · bolegaindia.ai</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        <button type="button" onClick={() => openSupport({ view: 'new' })} className="transition hover:text-text">Contact support</button>
        <a href="/terms" className="transition duration-200 hover:text-text">Terms</a>
        <span className="hidden sm:inline" aria-hidden="true">•</span>
        <a href="/privacy" className="transition duration-200 hover:text-text">Privacy</a>
        <span className="hidden sm:inline" aria-hidden="true">•</span>
        <span className="cursor-pointer transition duration-200 hover:text-text" onClick={() => showToast("Webhook simulated successfully")}>API Status</span>
      </div>
    </footer>
  );
};
