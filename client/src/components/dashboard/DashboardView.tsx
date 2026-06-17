import React, { useState } from 'react';
import { Bot, Lead } from '../../types';
import { Icons } from '../common/Icons';

import { StatsCards } from './StatsCards';
import { LeadTable } from './LeadTable';
import { ConversationList } from './ConversationList';
import { AppointmentsTab } from './AppointmentsTab';
import { BotSettings } from './BotSettings';
import { EmbedCodePanel } from './EmbedCodePanel';

interface DashboardViewProps {
  bots: Bot[];
  setBots: React.Dispatch<React.SetStateAction<Bot[]>>;
  activeBotId: string;
  setActiveBotId: (id: string) => void;
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  dashboardTab: string;
  setDashboardTab: (tab: string) => void;
  setView: (view: string) => void;
  launchPublicChat: (botId: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  setNewBotName: (name: string) => void;
  setNewBotGreeting: (greeting: string) => void;
  setNewBotKB: (kb: string) => void;
  todos?: any[];
  updateBot: (id: string, updates: Partial<{
    businessName: string;
    industry: string;
    greeting: string;
    primaryColor: string;
    languages: string[];
    knowledgeBase: string;
    allowedDomains: string[];
  }>) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  bots,
  setBots,
  activeBotId,
  setActiveBotId,
  leads,
  setLeads,
  dashboardTab,
  setDashboardTab,
  setView,
  launchPublicChat,
  showToast,
  setNewBotName,
  setNewBotGreeting,
  setNewBotKB,
  todos = [],
  updateBot
}: DashboardViewProps) => {
  const activeBot = bots.find(b => b.id === activeBotId) || bots[0];

  const getColorClass = (color: string) => {
    const maps: Record<string, string> = {
      indigo: 'bg-brand-accent',
      emerald: 'bg-brand-success',
      rose: 'bg-brand-danger',
      amber: 'bg-brand-warning',
    };
    return maps[color] || maps.indigo;
  };

  if (!activeBot) {
    return (
      <div className="p-12 text-center text-brand-muted space-y-4 font-sans">
        <Icons.Bot />
        <p className="text-sm">No chatbots created yet.</p>
        <button
          onClick={() => setView('onboarding')}
          className="px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-hover border border-brand-border text-brand-text font-sans font-semibold text-sm rounded-lg transition"
        >
          Create Your First Bot
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row font-sans">
      {/* Sidebar Bot Switcher */}
      <aside className="w-full lg:w-72 bg-brand-card border-r border-brand-border p-6 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-brand-muted tracking-wider uppercase font-mono">Active Chatbots</h3>
            <button
              onClick={() => {
                setNewBotName('');
                setNewBotGreeting('');
                setNewBotKB('');
                setView('onboarding');
              }}
              className="p-1 bg-brand-accent/10 border border-brand-border hover:bg-brand-accent text-brand-accent hover:text-brand-text rounded-lg transition"
              title="Add a new chatbot"
            >
              <Icons.Plus />
            </button>
          </div>

          <div className="space-y-2">
            {bots.map((bot) => {
              const isSelected = bot.id === activeBotId;
              return (
                <button
                  key={bot.id}
                  onClick={() => setActiveBotId(bot.id)}
                  className={`w-full text-left p-3.5 rounded-lg border flex items-center justify-between transition duration-200 ${isSelected ? 'bg-brand-accent/10 border-brand-accent text-brand-text font-semibold' : 'bg-brand-bg/40 border-brand-border text-brand-muted hover:bg-brand-bg hover:text-brand-text'}`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <span className={`w-2.5 h-2.5 rounded-full ${getColorClass(bot.primaryColor)}`}></span>
                    <span className="truncate text-sm">{bot.businessName}</span>
                  </div>
                  <Icons.ArrowRight />
                </button>
              );
            })}
          </div>

          <EmbedCodePanel 
            activeBot={activeBot} 
            showToast={showToast} 
            launchPublicChat={launchPublicChat} 
            updateBot={updateBot}
          />
        </div>

        {/* Sidebar bottom indicator */}
        <div className="pt-6 border-t border-brand-border text-xs text-brand-muted space-y-2 font-mono">
          <p>System Region: Pune, IN</p>
          
        </div>
      </aside>

      {/* Dashboard Workspace */}
      <section className="flex-1 p-6 lg:p-8 flex flex-col space-y-8 overflow-y-auto">
        {/* Dashboard Banner Info */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border pb-6">
          <div>
            <h2 className="text-3xl font-display font-extrabold text-brand-text">{activeBot.businessName} Console</h2>
            <p className="text-sm text-brand-muted mt-1 font-sans">
              Manage virtual receptionist parameters, check lead listings, and inspect conversation analytical feedback.
            </p>
          </div>
          
          {/* Mode Selector Tabs */}
          <div className="flex flex-wrap gap-1 bg-brand-card border border-brand-border p-1 rounded-lg">
            <button
              onClick={() => setDashboardTab('leads')}
              className={`px-3 py-2.5 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'leads' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}
            >
              Leads
            </button>
            <button
              onClick={() => setDashboardTab('conversations')}
              className={`px-3 py-2.5 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'conversations' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}
            >
              Conversations
            </button>
            <button
              onClick={() => setDashboardTab('appointments')}
              className={`px-3 py-2.5 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'appointments' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}
            >
              Appointments
            </button>
            <button
              onClick={() => setDashboardTab('settings')}
              className={`px-3 py-2.5 rounded-md text-xs font-sans font-semibold transition duration-200 ${dashboardTab === 'settings' ? 'bg-brand-accent border border-brand-border text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}
            >
              Settings
            </button>
          </div>
        </div>

        <StatsCards activeBot={activeBot} leads={leads} />

        {/* TAB 1: CRM LEADS LIST */}
        {dashboardTab === 'leads' && (
          <LeadTable 
            leads={leads} 
            setLeads={setLeads} 
            selectedBotId={activeBotId} 
            launchPublicChat={launchPublicChat} 
            showToast={showToast} 
          />
        )}

        {/* TAB 2: CONVERSATIONS */}
        {dashboardTab === 'conversations' && (
          <ConversationList activeBotId={activeBotId} />
        )}

        {/* TAB 3: APPOINTMENTS */}
        {dashboardTab === 'appointments' && (
          <AppointmentsTab />
        )}

        {/* TAB 4: UPDATE BOT KNOWLEDGE & FAQ */}
        {dashboardTab === 'settings' && (
          <BotSettings 
            bots={bots} 
            setBots={setBots} 
            activeBot={activeBot} 
            showToast={showToast} 
            updateBot={updateBot}
          />
        )}
      </section>
    </div>
  );
};
