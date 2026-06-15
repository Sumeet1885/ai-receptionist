import React from 'react';

interface FooterProps {
  showToast: (message: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ showToast }: FooterProps) => {
  return (
    <footer className="bg-black border-t border-brand-border px-6 py-6 text-center text-xs text-brand-muted flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
      <p>© 2026 Receptionist.ai - Built for Scale. Supporting Next.js integration.</p>
      <div className="flex items-center space-x-4">
        <span className="hover:text-brand-text cursor-pointer transition duration-200">Terms of Service</span>
        <span>•</span>
        <span className="hover:text-brand-text cursor-pointer transition duration-200">Privacy Policy</span>
        <span>•</span>
        <span className="hover:text-brand-text cursor-pointer transition duration-200" onClick={() => showToast("Webhook simulated successfully")}>API Status</span>
      </div>
    </footer>
  );
};
