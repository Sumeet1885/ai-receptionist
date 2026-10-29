import React from 'react';
import { BrandLogo } from '../ui/brand-logo';
import { openSupport } from '../../lib/supportDrawer';

export const Footer: React.FC = () => {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-border bg-background px-[5%] pt-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] text-xs text-text-subtle md:flex-row">
      <div className="flex flex-col items-center gap-2 md:flex-row md:gap-4">
        <BrandLogo className="h-7" />
        <p className="text-center md:text-left">© 2026 Bolega India · bolegaindia.ai</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        <button type="button" onClick={() => openSupport({ view: 'new' })} className="transition hover:text-text">Contact support</button>
        <a href="/terms" className="transition duration-200 hover:text-text">Terms</a>
        <span className="hidden sm:inline" aria-hidden="true">•</span>
        <a href="/privacy" className="transition duration-200 hover:text-text">Privacy</a>
      </div>
    </footer>
  );
};
