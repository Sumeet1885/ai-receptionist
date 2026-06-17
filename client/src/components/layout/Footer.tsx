import React from 'react';

interface FooterProps {
  showToast: (message: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ showToast }: FooterProps) => {
  return (
    <footer className="bg-black border-t border-brand-border px-4 sm:px-6 py-6 text-center text-xs text-brand-muted flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
      <p className="text-center md:text-left">© 2026 AI Receptionist - Built for Scale.</p>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        <span className="hover:text-brand-text cursor-pointer transition duration-200">Terms</span>
        <span className="hidden sm:inline">•</span>
        <span className="hover:text-brand-text cursor-pointer transition duration-200">Privacy</span>
        <span className="hidden sm:inline">•</span>
        <span className="hover:text-brand-text cursor-pointer transition duration-200" onClick={() => showToast("Webhook simulated successfully")}>API Status</span>
      </div>
    </footer>
  );
};
