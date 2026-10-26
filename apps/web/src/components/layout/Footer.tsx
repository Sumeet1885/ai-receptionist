import React from 'react';
import { BrandLogo } from '../ui/brand-logo';

interface FooterProps {
  showToast: (message: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ showToast }: FooterProps) => {
  return (
    <footer className="flex flex-col items-center justify-between gap-4 border-t border-border bg-background px-4 py-6 text-xs text-text-subtle sm:px-6 md:flex-row">
      <div className="flex flex-col items-center gap-2 md:flex-row md:gap-4">
        <BrandLogo mark="logo" className="text-base" markClassName="h-7 w-7" />
        <p className="text-center md:text-left">© 2026 Bolega India · bolegaindia.ai</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        <span className="cursor-pointer transition duration-200 hover:text-text">Terms</span>
        <span className="hidden sm:inline" aria-hidden="true">•</span>
        <span className="cursor-pointer transition duration-200 hover:text-text">Privacy</span>
        <span className="hidden sm:inline" aria-hidden="true">•</span>
        <span className="cursor-pointer transition duration-200 hover:text-text" onClick={() => showToast("Webhook simulated successfully")}>API Status</span>
      </div>
    </footer>
  );
};
