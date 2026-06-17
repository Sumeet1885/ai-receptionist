import React, { useState } from 'react';
import { Icons } from '../common/Icons';
import { getWidgetBaseUrl, getWidgetScriptTag, isLocalWidgetBaseUrl } from '../../lib/widgetInstall';

interface DeploymentSuccessModalProps {
  botId: string;
  subDomain: string;
  botName: string;
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export const DeploymentSuccessModal: React.FC<DeploymentSuccessModalProps> = ({
  botId,
  subDomain,
  botName,
  onClose,
  showToast
}) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const baseUrl = window.location.origin;
  const widgetBaseUrl = getWidgetBaseUrl();
  const scriptTag = getWidgetScriptTag(botId);
  const isLocalInstallScript = isLocalWidgetBaseUrl(widgetBaseUrl);
  const publicLink = `${baseUrl}/chats/${subDomain}`;

  const aiPrompt = `I want to embed my AI Receptionist chat widget on my website.
Please add the following script tag to the \`<head>\` or \`<body>\` of my HTML or React app:

\`\`\`html
${scriptTag}
\`\`\`

Critical Implementation Steps:
1. Ensure the script is loaded exactly as provided.
2. The widget will automatically load a floating chat bubble in the bottom right corner of the screen.
3. Once implemented, please give me my website's domain to add to the allowed domains list in the AI Receptionist dashboard.

Please implement this now.`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptTag);
    setCopiedScript(true);
    showToast(isLocalInstallScript ? 'Copied local-only script. Do not use it on public websites.' : 'Script tag copied!', isLocalInstallScript ? 'error' : 'success');
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(aiPrompt);
    setCopiedPrompt(true);
    showToast('AI Agent prompt copied to clipboard!', 'success');
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicLink);
    setCopiedLink(true);
    showToast('Public link copied!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
      <div 
        className="bg-brand-card border border-brand-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-brand-success/10 flex items-center justify-center text-brand-success shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-brand-text">Agent Deployed!</h2>
                <p className="text-sm text-brand-muted mt-1">"{botName}" is now live and ready to take conversations.</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-brand-bg rounded-lg text-brand-muted hover:text-brand-text transition shrink-0"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Public Chat Link</label>
              <div className="flex">
                <input 
                  type="text" 
                  readOnly 
                  value={publicLink}
                  className="flex-1 bg-brand-bg border border-brand-border rounded-l-lg px-4 py-3 text-brand-text text-sm font-mono focus:outline-none"
                />
                <button 
                  onClick={handleCopyLink}
                  className="bg-brand-bg border border-brand-border border-l-0 rounded-r-lg px-4 py-3 text-brand-accent hover:text-brand-accent-hover hover:bg-brand-accent/5 transition flex items-center justify-center font-semibold text-sm w-24 shrink-0"
                >
                  {copiedLink ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-brand-muted mt-1.5 ml-1">Share this link directly with customers for full-page chat.</p>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Embed Script Tag</label>
              {isLocalInstallScript && (
                <div className="mb-3 bg-brand-danger/10 border border-brand-danger/30 rounded-lg p-3 text-sm text-brand-text">
                  <p className="font-bold text-brand-danger">This script is local-only.</p>
                  <p className="text-xs text-brand-muted mt-1">
                    It points to {widgetBaseUrl}. It will only work on this computer while the backend server is running. For GitHub Pages or any public website, use a deployed HTTPS API URL in VITE_WIDGET_BASE_URL.
                  </p>
                </div>
              )}
              <div className="bg-brand-bg border border-brand-border rounded-lg p-4 relative group">
                <pre className="text-xs sm:text-sm text-brand-text font-mono whitespace-pre-wrap break-all leading-relaxed pr-16">{scriptTag}</pre>
                <button 
                  onClick={handleCopyScript}
                  className="absolute top-3 right-3 p-2 bg-brand-card hover:bg-brand-accent hover:text-white border border-brand-border rounded-md text-brand-muted transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shadow-sm"
                  title="Copy Script"
                >
                  {copiedScript ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Icons.Copy />
                  )}
                </button>
              </div>
            </div>
            
            <div className="bg-brand-accent/5 border border-brand-accent/20 rounded-xl p-5 mt-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-brand-accent/20 text-brand-accent rounded-lg shrink-0">
                  <Icons.Bot />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-display font-semibold text-brand-text">Building with an AI Developer?</h4>
                  <p className="text-xs text-brand-muted mt-1 mb-3 leading-relaxed">
                    If you are using an AI coding assistant like Antigravity, Lovable, Claude Code, or Cursor, copy the full prompt below and paste it into your AI. It will automatically understand and implement the widget for you.
                  </p>
                  <button 
                    onClick={handleCopyPrompt}
                    className="w-full sm:w-auto px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text font-sans font-semibold text-sm rounded-lg shadow-md transition flex items-center justify-center gap-2"
                  >
                    {copiedPrompt ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Prompt Copied
                      </>
                    ) : (
                      <>
                        <Icons.Copy />
                        Copy Prompt for AI Agent
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-brand-bg px-6 py-4 border-t border-brand-border flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-brand-card hover:bg-brand-bg border border-brand-border text-brand-text font-sans font-semibold text-sm rounded-lg transition"
          >
            Go to Console
          </button>
        </div>
      </div>
    </div>
  );
};
