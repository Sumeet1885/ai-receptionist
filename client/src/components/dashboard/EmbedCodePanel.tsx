import React from 'react';
import { Bot } from '../../types';
import { Icons } from '../common/Icons';

interface EmbedCodePanelProps {
  activeBot: Bot;
  showToast: (message: string, type?: 'success' | 'error') => void;
  launchPublicChat: (botId: string) => void;
}

export const EmbedCodePanel: React.FC<EmbedCodePanelProps> = ({ activeBot, showToast, launchPublicChat }) => {
  return (
    <div className="bg-brand-bg border border-brand-border p-4 rounded-xl space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-brand-text">Public Hosted URL</h4>
        <span className="text-[10px] text-brand-success border border-brand-success/30 bg-brand-success/10 px-1.5 py-0.5 rounded font-mono">LIVE</span>
      </div>
      <p className="text-[11px] text-brand-muted break-all font-mono">
        receptionist.ai/chats/{activeBot.subDomain}
      </p>
      <div className="flex space-x-2 pt-1">
        <button
          onClick={() => {
            const dummyLink = `${window.location.origin}/chats/${activeBot.subDomain}`;
            navigator.clipboard.writeText(dummyLink);
            showToast("Copied chatbot link to clipboard!");
          }}
          className="flex-1 py-2.5 bg-brand-card hover:bg-brand-border text-brand-text text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition border border-brand-border"
        >
          <Icons.Copy />
          <span>Copy Link</span>
        </button>
        <button
          onClick={() => launchPublicChat(activeBot.id)}
          className="flex-1 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition border border-brand-border"
        >
          <Icons.ExternalLink />
          <span>Open Client</span>
        </button>
      </div>
    </div>
  );
};
