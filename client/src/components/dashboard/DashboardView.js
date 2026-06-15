import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Icons } from '../common/Icons';
import { StatsCards } from './StatsCards';
import { LeadTable } from './LeadTable';
import { ConversationList } from './ConversationList';
import { AppointmentsTab } from './AppointmentsTab';
import { BotSettings } from './BotSettings';
import { EmbedCodePanel } from './EmbedCodePanel';
export const DashboardView = ({ bots, setBots, activeBotId, setActiveBotId, leads, setLeads, dashboardTab, setDashboardTab, setView, launchPublicChat, showToast, setNewBotName, setNewBotGreeting, setNewBotKB, todos = [] }) => {
    const activeBot = bots.find(b => b.id === activeBotId) || bots[0];
    const getColorClass = (color) => {
        const maps = {
            indigo: 'bg-brand-accent',
            emerald: 'bg-brand-success',
            rose: 'bg-brand-danger',
            amber: 'bg-brand-warning',
        };
        return maps[color] || maps.indigo;
    };
    if (!activeBot) {
        return (_jsxs("div", { className: "p-12 text-center text-brand-muted space-y-4 font-sans", children: [_jsx(Icons.Bot, {}), _jsx("p", { className: "text-sm", children: "No chatbots created yet." }), _jsx("button", { onClick: () => setView('onboarding'), className: "px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border text-brand-text font-sans font-semibold text-sm rounded-lg transition", children: "Create Your First Bot" })] }));
    }
    return (_jsxs("div", { className: "flex-1 flex flex-col lg:flex-row font-sans", children: [_jsxs("aside", { className: "w-full lg:w-72 bg-brand-card border-r border-brand-border p-6 flex flex-col justify-between shrink-0", children: [_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-xs font-bold text-brand-muted tracking-wider uppercase font-mono", children: "Active Chatbots" }), _jsx("button", { onClick: () => {
                                            setNewBotName('');
                                            setNewBotGreeting('');
                                            setNewBotKB('');
                                            setView('onboarding');
                                        }, className: "p-1 bg-brand-accent/10 border border-brand-border hover:bg-brand-accent text-brand-accent hover:text-brand-text rounded-lg transition", title: "Add a new chatbot", children: _jsx(Icons.Plus, {}) })] }), _jsx("div", { className: "space-y-2", children: bots.map((bot) => {
                                    const isSelected = bot.id === activeBotId;
                                    return (_jsxs("button", { onClick: () => setActiveBotId(bot.id), className: `w-full text-left p-3.5 rounded-lg border flex items-center justify-between transition duration-200 ${isSelected ? 'bg-brand-accent/10 border-brand-accent text-brand-text font-semibold' : 'bg-brand-bg/40 border-brand-border text-brand-muted hover:bg-brand-bg hover:text-brand-text'}`, children: [_jsxs("div", { className: "flex items-center space-x-3 truncate", children: [_jsx("span", { className: `w-2.5 h-2.5 rounded-full ${getColorClass(bot.primaryColor)}` }), _jsx("span", { className: "truncate text-sm", children: bot.businessName })] }), _jsx(Icons.ArrowRight, {})] }, bot.id));
                                }) }), _jsx(EmbedCodePanel, { activeBot: activeBot, showToast: showToast, launchPublicChat: launchPublicChat })] }), _jsxs("div", { className: "pt-6 border-t border-brand-border text-xs text-brand-muted space-y-2 font-mono", children: [_jsx("p", { children: "System Region: Pune, IN" }), _jsx("p", { children: "Cloud Storage: Enabled (Supabase)" })] })] }), _jsxs("section", { className: "flex-1 p-6 lg:p-8 flex flex-col space-y-8 overflow-y-auto", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border pb-6", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-3xl font-display font-extrabold text-brand-text", children: [activeBot.businessName, " Console"] }), _jsx("p", { className: "text-sm text-brand-muted mt-1 font-sans", children: "Manage virtual receptionist parameters, check lead listings, and inspect conversation analytical feedback." })] }), _jsxs("div", { className: "flex space-x-1 bg-brand-card border border-brand-border p-1 rounded-lg", children: [_jsx("button", { onClick: () => setDashboardTab('leads'), className: `px-4 py-2 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'leads' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`, children: "Inbox & CRM Leads" }), _jsx("button", { onClick: () => setDashboardTab('conversations'), className: `px-4 py-2 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'conversations' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`, children: "Conversations" }), _jsx("button", { onClick: () => setDashboardTab('appointments'), className: `px-4 py-2 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'appointments' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`, children: "Appointments" }), _jsx("button", { onClick: () => setDashboardTab('settings'), className: `px-4 py-2 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'settings' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`, children: "Bot Training" })] })] }), _jsx(StatsCards, { activeBot: activeBot, leads: leads }), dashboardTab === 'leads' && (_jsx(LeadTable, { leads: leads, setLeads: setLeads, activeBotId: activeBotId, launchPublicChat: launchPublicChat, showToast: showToast })), dashboardTab === 'conversations' && (_jsx(ConversationList, { activeBotId: activeBotId })), dashboardTab === 'appointments' && (_jsx(AppointmentsTab, {})), dashboardTab === 'settings' && (_jsx(BotSettings, { bots: bots, setBots: setBots, activeBot: activeBot, showToast: showToast }))] })] }));
};
