import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { Icons } from '../common/Icons';
import { useConversations } from '../../hooks/useConversations';
export const ConversationDetail = ({ session, onBack }) => {
    const { messages, fetchMessagesForSession, loading } = useConversations();
    useEffect(() => {
        fetchMessagesForSession(session.id);
    }, [session.id, fetchMessagesForSession]);
    return (_jsxs("div", { className: "bg-brand-card border border-brand-border rounded-xl shadow-sm flex flex-col h-[600px]", children: [_jsx("div", { className: "px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/40 shrink-0", children: _jsxs("div", { className: "flex items-center gap-4", children: [_jsx("button", { onClick: onBack, className: "p-1.5 bg-brand-bg border border-brand-border hover:bg-brand-border rounded-lg transition", children: _jsx(Icons.ArrowRight, {}) }), _jsxs("div", { children: [_jsxs("h3", { className: "font-display font-bold text-brand-text text-lg", children: ["Transcript: ", session.visitorId] }), _jsx("p", { className: "text-xs text-brand-muted font-mono", children: session.startedAt })] })] }) }), _jsx("div", { className: "flex-1 overflow-y-auto p-6 space-y-4", children: loading ? (_jsx("div", { className: "flex justify-center py-12", children: _jsx("p", { className: "text-sm font-sans animate-pulse text-brand-muted", children: "Loading transcript..." }) })) : messages.length === 0 ? (_jsx("div", { className: "text-center py-12 text-brand-muted", children: _jsx("p", { children: "No messages found in this session." }) })) : (messages.map((msg) => (_jsx("div", { className: `flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`, children: _jsxs("div", { className: `max-w-[80%] rounded-2xl p-4 font-sans text-sm shadow-sm ${msg.sender === 'user'
                            ? 'bg-brand-accent text-brand-bg rounded-tr-sm'
                            : 'bg-brand-bg border border-brand-border text-brand-text rounded-tl-sm'}`, children: [_jsx("div", { className: "whitespace-pre-wrap", children: msg.text }), _jsx("div", { className: `text-[10px] mt-2 font-mono ${msg.sender === 'user' ? 'text-brand-bg/70' : 'text-brand-muted/70'}`, children: msg.timestamp })] }) }, msg.id)))) })] }));
};
