import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Icons } from '../common/Icons';
import { useConversations } from '../../hooks/useConversations';
import { ConversationDetail } from './ConversationDetail';
export const ConversationList = ({ activeBotId }) => {
    const { sessions, fetchSessions, loading } = useConversations();
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    useEffect(() => {
        if (activeBotId) {
            fetchSessions(activeBotId);
            setSelectedSessionId(null);
        }
    }, [activeBotId, fetchSessions]);
    if (selectedSessionId) {
        const session = sessions.find(s => s.id === selectedSessionId);
        return (_jsx(ConversationDetail, { session: session, onBack: () => setSelectedSessionId(null) }));
    }
    return (_jsxs("div", { className: "bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm", children: [_jsxs("div", { className: "px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/40", children: [_jsxs("h3", { className: "font-display font-bold text-brand-text text-lg flex items-center", children: [_jsx(Icons.Chat, {}), _jsx("span", { className: "ml-2", children: "Chat Sessions" })] }), _jsxs("button", { onClick: () => fetchSessions(activeBotId), className: "text-xs font-mono text-brand-accent hover:text-brand-accent-hover transition flex items-center space-x-1", children: [_jsx(Icons.Refresh, {}), _jsx("span", { children: "Refresh" })] })] }), _jsx("div", { className: "divide-y divide-brand-border", children: loading ? (_jsx("div", { className: "p-12 text-center text-brand-muted space-y-4", children: _jsx("p", { className: "text-sm font-sans animate-pulse", children: "Loading sessions..." }) })) : sessions.length === 0 ? (_jsxs("div", { className: "p-12 text-center text-brand-muted space-y-4", children: [_jsx(Icons.Chat, {}), _jsx("p", { className: "text-sm font-sans", children: "No chat sessions recorded yet." })] })) : (sessions.map((session) => (_jsxs("div", { onClick: () => setSelectedSessionId(session.id), className: "p-6 hover:bg-brand-bg/20 transition cursor-pointer flex flex-col md:flex-row justify-between gap-4", children: [_jsxs("div", { className: "space-y-2 flex-1", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("h4", { className: "text-md font-display font-bold text-brand-text truncate max-w-xs", children: session.visitorId }), _jsx("span", { className: "text-xs text-brand-muted font-mono", children: session.startedAt }), _jsxs("span", { className: "px-2 py-0.5 bg-brand-bg border border-brand-border text-brand-muted text-[10px] font-bold rounded font-mono", children: [session.messageCount, " messages"] })] }), _jsxs("p", { className: "text-sm text-brand-muted font-sans truncate pr-4", children: ["\"", session.lastMessage, "\""] })] }), _jsx("div", { className: "flex items-center shrink-0", children: _jsx(Icons.ArrowRight, {}) })] }, session.id)))) })] }));
};
