import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';
export const AppointmentsTab = () => {
    const [calendarConnected, setCalendarConnected] = useState(false);
    const [provider, setProvider] = useState(null);
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                const token = session.access_token;
                fetch('http://localhost:4000/api/calendar/status', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(res => res.json())
                    .then(data => {
                    if (data.connected) {
                        setCalendarConnected(true);
                        setProvider(data.provider);
                    }
                })
                    .catch(console.error);
            }
        });
    }, []);
    const connectCalendar = async (targetProvider) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session)
            return;
        const token = session.access_token;
        try {
            const res = await fetch(`http://localhost:4000/api/calendar/auth-url?provider=${targetProvider}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url; // Redirect to OAuth consent
            }
        }
        catch (err) {
            console.error(err);
        }
    };
    return (_jsxs("div", { className: "bg-brand-card border border-brand-border rounded-xl overflow-hidden shadow-sm h-full flex flex-col", children: [_jsxs("div", { className: "px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/40", children: [_jsxs("h3", { className: "font-display font-bold text-brand-text text-lg flex items-center", children: [_jsx(Icons.Calendar, {}), _jsx("span", { className: "ml-2", children: "Calendar Integration" })] }), calendarConnected && (_jsxs("span", { className: "px-2.5 py-1 bg-brand-success/10 border border-brand-success/30 text-brand-success text-[10px] font-bold rounded font-mono flex items-center", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-brand-success mr-1.5 animate-pulse" }), "Sync Active"] }))] }), _jsx("div", { className: "p-16 text-center space-y-6 flex-1", children: calendarConnected ? (_jsxs("div", { className: "space-y-4 max-w-sm mx-auto", children: [_jsx("div", { className: "inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-success/10 border border-brand-success/30 text-brand-success mb-2", children: _jsx(Icons.Check, {}) }), _jsx("h4", { className: "text-xl font-display font-bold text-brand-text", children: "Calendar Connected" }), _jsxs("p", { className: "text-sm font-sans text-brand-muted", children: ["Your AI Receptionist can now view your availability and schedule appointments automatically via ", provider === 'google' ? 'Google Calendar' : 'Outlook Calendar', "."] }), _jsxs("div", { className: "pt-4 p-4 border border-brand-border bg-brand-bg rounded-lg", children: [_jsx("h5", { className: "text-xs font-bold font-mono text-brand-muted mb-2 text-left uppercase", children: "Upcoming Bookings" }), _jsx("div", { className: "text-sm font-sans text-brand-muted py-4", children: "No recent bookings. Check back soon!" })] })] })) : (_jsxs("div", { className: "space-y-5", children: [_jsx("div", { className: "inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-bg border border-brand-border text-brand-muted mb-2", children: _jsx(Icons.Calendar, {}) }), _jsx("h4", { className: "text-xl font-display font-bold text-brand-text", children: "Connect Your Calendar" }), _jsx("p", { className: "text-sm font-sans text-brand-muted max-w-md mx-auto", children: "To let your AI Receptionist book appointments automatically, you need to connect your Google or Outlook calendar first." }), _jsxs("div", { className: "pt-6 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto", children: [_jsxs("button", { onClick: () => connectCalendar('google'), className: "w-full flex items-center justify-center space-x-2 px-6 py-3 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 font-sans font-semibold rounded-lg transition", children: [_jsx(Icons.Google, {}), _jsx("span", { children: "Google Calendar" })] }), _jsxs("button", { onClick: () => connectCalendar('outlook'), className: "w-full flex items-center justify-center space-x-2 px-6 py-3 bg-[#00a4ef] hover:bg-[#0086c4] text-white border border-[#00a4ef] font-sans font-semibold rounded-lg transition", children: [_jsx(Icons.Microsoft, {}), _jsx("span", { children: "Outlook Calendar" })] })] })] })) })] }));
};
