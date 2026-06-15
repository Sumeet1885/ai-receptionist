import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Icons } from '../common/Icons';
export const BotSettings = ({ bots, setBots, activeBot, showToast }) => {
    return (_jsxs("div", { className: "bg-brand-card p-8 rounded-xl border border-brand-border space-y-6 shadow-sm", children: [_jsxs("h3", { className: "text-xl font-display font-bold text-brand-text border-b border-brand-border pb-3 flex items-center", children: [_jsx(Icons.Settings, {}), _jsx("span", { className: "ml-2", children: "Live Refinement & FAQ Expansion" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono", children: "Configure Web Greeting" }), _jsx("input", { type: "text", value: activeBot.greeting, onChange: (e) => {
                            const updated = bots.map(b => b.id === activeBot.id ? { ...b, greeting: e.target.value } : b);
                            setBots(updated);
                        }, className: "w-full bg-brand-bg border border-brand-border rounded-md px-4 py-3 text-brand-text focus:outline-none focus:border-brand-accent transition font-sans text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono", children: "Modify Active Knowledge Base" }), _jsx("textarea", { rows: 8, value: activeBot.knowledgeBase, onChange: (e) => {
                            const updated = bots.map(b => b.id === activeBot.id ? { ...b, knowledgeBase: e.target.value } : b);
                            setBots(updated);
                        }, className: "w-full bg-brand-bg border border-brand-border rounded-md px-4 py-3 text-brand-text text-sm font-sans leading-relaxed focus:outline-none focus:border-brand-accent transition" })] }), _jsx("div", { className: "pt-4 border-t border-brand-border flex justify-end", children: _jsx("button", { onClick: () => {
                        showToast("Knowledge Base changes processed successfully!");
                    }, className: "px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border text-brand-text font-sans font-bold rounded-lg transition duration-200", children: "Save Knowledge Base" }) })] }));
};
