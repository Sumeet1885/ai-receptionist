import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabaseClient';

import { Toast as ToastType } from './types';
import { defaultWidgetConfig, mergeWidgetConfig } from './lib/widgetConfig';
import { getLeadRefreshInterval } from './lib/leadQuery';
import { useAuth } from './hooks/useAuth';
import { useBots } from './hooks/useBots';
import { useLeads } from './hooks/useLeads';
import { useChat } from './hooks/useChat';

import { Toast } from './components/common/Toast';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';

import { LandingView } from './components/landing/LandingView';
import { OnboardingView } from './components/onboarding/OnboardingView';
import { DeploymentSuccessModal } from './components/onboarding/DeploymentSuccessModal';
import { PublicChatView } from './components/chat/PublicChatView';
import { AuthView } from './components/auth/AuthView';
import { PostLoginShell } from './components/dashboard/PostLoginShell';
import { DashboardHome } from './components/dashboard/DashboardHome';
import { LeadsWorkspace } from './components/dashboard/LeadsWorkspace';
import { ConversationList } from './components/dashboard/ConversationList';
import { AppointmentsTab } from './components/dashboard/AppointmentsTab';
import { AgentsPage } from './components/dashboard/AgentsPage';
import { AgentDetailPage } from './components/dashboard/AgentDetailPage';
import { CallsWorkspace } from './modules/phone-calls/CallsWorkspace';

type AgentTab = 'overview' | 'knowledge' | 'install' | 'crm' | 'preview';

type AppRoute =
  | { name: 'landing' }
  | { name: 'auth'; mode: 'signin' | 'signup' }
  | { name: 'dashboard' }
  | { name: 'leads' }
  | { name: 'inbox' }
  | { name: 'calendar' }
  | { name: 'calls' }
  | { name: 'agents' }
  | { name: 'agent-new' }
  | { name: 'agent-detail'; botId: string; tab: AgentTab }
  | { name: 'public-chat'; subdomain: string };

const agentTabs: AgentTab[] = ['overview', 'knowledge', 'install', 'crm', 'preview'];

function parseRoute(): AppRoute {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  const chatMatch = path.match(/^\/chats\/([^/]+)/);
  if (chatMatch) return { name: 'public-chat', subdomain: decodeURIComponent(chatMatch[1]) };

  if (path === '/auth') {
    return { name: 'auth', mode: params.get('mode') === 'signup' ? 'signup' : 'signin' };
  }
  if (path === '/dashboard') return { name: 'dashboard' };
  if (path === '/leads') return { name: 'leads' };
  if (path === '/inbox') return { name: 'inbox' };
  if (path === '/calendar') return { name: 'calendar' };
  if (path === '/calls') return { name: 'calls' };
  if (path === '/agents/new') return { name: 'agent-new' };
  if (path === '/agents') return { name: 'agents' };

  const agentMatch = path.match(/^\/agents\/([^/]+)(?:\/([^/]+))?/);
  if (agentMatch) {
    const tab = agentTabs.includes(agentMatch[2] as AgentTab) ? agentMatch[2] as AgentTab : 'overview';
    return { name: 'agent-detail', botId: decodeURIComponent(agentMatch[1]), tab };
  }

  return { name: 'landing' };
}

function isProtectedRoute(route: AppRoute) {
  return !['landing', 'auth', 'public-chat'].includes(route.name);
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute());
  const [toast, setToast] = useState<ToastType | null>(null);
  const loadedPublicSubdomainRef = useRef<string>('');
  const toastTimerRef = useRef<number | null>(null);

  const { user, signOut } = useAuth();
  const { bots, setBots, activeBotId, setActiveBotId, fetchBots, createBot, updateBot, deleteBot } = useBots();
  const { leads, setLeads, fetchLeads } = useLeads();
  const chat = useChat();

  const [newBotName, setNewBotName] = useState('');
  const [newBotIndustry, setNewBotIndustry] = useState('Education');
  const [newBotGreeting, setNewBotGreeting] = useState('');
  const [newBotKB, setNewBotKB] = useState('');
  const [newBotColor, setNewBotColor] = useState('indigo');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [newlyCreatedBotId, setNewlyCreatedBotId] = useState<string | null>(null);
  const [leadAgentFilter, setLeadAgentFilter] = useState<string | 'all'>('all');

  const navigate = (path: string, replace = false) => {
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    setRoute(parseRoute());
  };

  const legacySetView = (view: string) => {
    const map: Record<string, string> = {
      landing: '/',
      'auth-signin': '/auth?mode=signin',
      'auth-signup': '/auth?mode=signup',
      onboarding: '/agents/new',
      dashboard: '/dashboard',
      'public-chat': '/dashboard'
    };
    navigate(map[view] || '/dashboard');
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (user) {
      fetchBots();
      fetchLeads();
      if (route.name === 'auth' || route.name === 'landing') {
        const justSignedUp = localStorage.getItem('just_signed_up') === 'true' || 
          (user.last_sign_in_at && user.created_at && Math.abs(new Date(user.last_sign_in_at).getTime() - new Date(user.created_at).getTime()) < 30000);
        
        if (justSignedUp) {
          localStorage.removeItem('just_signed_up');
          navigate('/agents/new', true);
        } else if (route.name === 'auth') {
          navigate('/dashboard', true);
        }
      }
    } else if (isProtectedRoute(route)) {
      navigate('/', true);
    }
  }, [user, route.name]);

  useEffect(() => {
    if (!user) return;

    const refreshInterval = getLeadRefreshInterval(route.name);
    if (!refreshInterval) return;

    const interval = setInterval(fetchLeads, refreshInterval);
    return () => clearInterval(interval);
  }, [route.name, user, fetchLeads]);

  useEffect(() => {
    if (route.name === 'agent-detail' && route.botId && activeBotId !== route.botId) {
      setActiveBotId(route.botId);
    }
  }, [route, activeBotId, setActiveBotId]);

  useEffect(() => {
    const loadStandaloneChat = async () => {
      if (route.name !== 'public-chat') return;
      if (loadedPublicSubdomainRef.current === route.subdomain) return;
      loadedPublicSubdomainRef.current = route.subdomain;

      try {
        const expressUrl = import.meta.env.VITE_EXPRESS_SERVER_URL || 'http://localhost:4000';
        const response = await fetch(`${expressUrl}/api/chat/bot/subdomain/${encodeURIComponent(route.subdomain)}`);
        if (!response.ok) {
          showToast('Chatbot not found or inactive', 'error');
          navigate('/', true);
          return;
        }
        const data = await response.json();

        const mappedBot = {
          id: data.id,
          businessName: data.business_name,
          industry: data.industry,
          subDomain: data.subdomain,
          greeting: data.greeting,
          primaryColor: data.primary_color,
          languages: data.languages || ['English'],
          knowledgeBase: '',
          allowedDomains: [],
          widgetConfig: mergeWidgetConfig(data.widget_config),
          createdAt: data.created_at
        };

        setBots(prev => {
          if (prev.some(b => b.id === mappedBot.id)) return prev;
          return [...prev, mappedBot];
        });
        setActiveBotId(mappedBot.id);
        await chat.startSession(mappedBot.id, mappedBot.greeting);
      } catch (err) {
        console.error('Error loading public chatbot:', err);
        showToast('Failed to load public chatbot', 'error');
        navigate('/', true);
      }
    };

    loadStandaloneChat();
  }, [route]);

  const applyOnboardingTemplate = (industry: string) => {
    if (industry === 'Education') {
      setNewBotName('Alpha Education Institute');
      setNewBotGreeting('Welcome to Alpha Education! How can I help you with details on engineering admissions, MBA courses, or fee structures today?');
      setNewBotKB(`Alpha Education Institute details:\n1. Available Programs:\n- Executive MBA (1 Year Program) - Fee: INR 2,50,000.\n- Master's in Computer Science (2 Years) - Fee: INR 1,80,000 per year.\n2. Admissions: Opens in June. Apply online on our portal.\n3. Office Location: Sector-5, Salt Lake, Kolkata.`);
    } else if (industry === 'Real Estate') {
      setNewBotName('Apex Horizon Estates');
      setNewBotGreeting('Welcome to Apex Horizon Estates! Interested in our premium high-rise projects, commercial spaces, or planning a direct site visit?');
      setNewBotKB(`Apex Horizon Estates portfolio details:\n1. Active Project: "Horizon Heights" located in Kharadi, Pune.\n- Configurations: premium 2 BHK (INR 85 Lakhs onwards) and 3 BHK (INR 1.25 Cr onwards).\n- Amenities: Infinite swimming pool, sky garden, fully equipped modern gym.\n2. Site Visits: Open daily from 9:00 AM to 7:00 PM.`);
    } else if (industry === 'Recruitment') {
      setNewBotName('Recrui8 Tech Staffing');
      setNewBotGreeting('Hello! I am the Recrui8 Virtual HR Assistant. I can help you browse active technical openings, track candidate application status, or schedule interviews!');
      setNewBotKB(`Recrui8 Tech Staffing guide:\n1. Active Technical Openings:\n- Senior React Developer: Requires 5+ years of experience. Salary: 18-24 LPA.\n- AI Product Engineer: Requires expertise in LLMs, Gemini/OpenAI API integrations. Salary: 20-30 LPA.\n2. Candidate Application Process:\nSubmit Resume, GitHub Link, and complete a 45-minute coding challenge.`);
    } else if (industry === 'Other') {
      setNewBotName('');
      setNewBotGreeting('Welcome to our business! How can our virtual assistant help you today?');
      setNewBotKB('Add details about your business here...');
    }
  };

  useEffect(() => {
    applyOnboardingTemplate(newBotIndustry);
  }, [newBotIndustry]);

  const launchPublicChat = async (botId: string) => {
    const selectedBot = bots.find(b => b.id === botId);
    if (!selectedBot) return;
    window.open(`${window.location.origin}/chats/${selectedBot.subDomain}`, '_blank');
  };

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBotName.trim()) return showToast('Please enter a business name', 'error');
    if (!user) return showToast('Please sign in first to create a bot', 'error');

    const baseSubDomain = newBotName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').trim();
    const subDomain = `${baseSubDomain || 'bot'}-${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      const newBotId = await createBot({
        owner_id: user.id,
        business_name: newBotName,
        industry: newBotIndustry,
        subdomain: subDomain,
        greeting: newBotGreeting || `Welcome to ${newBotName}. How can our virtual assistant help you today?`,
        primary_color: newBotColor,
        knowledge_base: newBotKB || 'A general premium service business. Feel free to enquire about prices, hours and services.',
        widget_config: {
          ...defaultWidgetConfig,
          assistantName: newBotName || 'AI Receptionist',
          avatarText: (newBotName || 'AI').slice(0, 2).toUpperCase()
        }
      });
      setNewlyCreatedBotId(newBotId);
      showToast('Receptionist created. Your link is live.', 'success');
      navigate('/dashboard');
    } catch (err: any) {
      showToast('Error creating bot: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  const activeBot = bots.find(b => b.id === activeBotId) || (bots.length > 0 ? bots[0] : null);
  const routeBot = route.name === 'agent-detail' ? bots.find(b => b.id === route.botId) || activeBot : activeBot;
  const isStandaloneChat = route.name === 'public-chat';

  const noAgentState = (
    <div className="bg-brand-card border border-brand-border rounded-lg p-10 text-center text-brand-muted">
      <p className="text-sm">Create an agent first so your receptionist can start collecting leads.</p>
      <button
        onClick={() => navigate('/agents/new')}
        className="mt-4 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text rounded-lg text-sm font-bold transition"
      >
        Create Agent
      </button>
    </div>
  );

  return (
    <div className={`bg-brand-bg text-brand-text font-sans antialiased flex flex-col selection:bg-brand-accent/30 selection:text-white ${isStandaloneChat ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {toast && <Toast toast={toast} />}

      {!isStandaloneChat && (
        <Header
          routeName={route.name}
          navigate={navigate}
          user={user}
          signOut={signOut}
        />
      )}

      <main className="flex-1 flex flex-col min-h-0">
        {route.name === 'landing' && (
          <LandingView
            setView={legacySetView}
            setActiveBotId={setActiveBotId}
            applyOnboardingTemplate={applyOnboardingTemplate}
            launchPublicChat={launchPublicChat}
            user={user}
          />
        )}

        {route.name === 'auth' && (
          <AuthView
            setView={legacySetView}
            showToast={showToast}
            defaultMode={route.mode}
          />
        )}

        {route.name === 'agent-new' && (
          <OnboardingView
            newBotName={newBotName}
            setNewBotName={setNewBotName}
            newBotIndustry={newBotIndustry}
            setNewBotIndustry={setNewBotIndustry}
            newBotGreeting={newBotGreeting}
            setNewBotGreeting={setNewBotGreeting}
            newBotKB={newBotKB}
            setNewBotKB={setNewBotKB}
            newBotColor={newBotColor}
            setNewBotColor={setNewBotColor}
            setView={legacySetView}
            handleCreateBot={handleCreateBot}
          />
        )}

        {route.name === 'dashboard' && (
          <PostLoginShell
            title="Dashboard"
            subtitle="Your daily home for leads, appointments, and receptionist health."
          >
            <DashboardHome
              activeBot={activeBot}
              bots={bots}
              leads={leads}
              navigate={navigate}
              launchPublicChat={launchPublicChat}
            />
          </PostLoginShell>
        )}

        {route.name === 'leads' && (
          <PostLoginShell
            title="Leads"
            subtitle="People who spoke with your receptionist and may need follow-up."
          >
            {activeBot ? (
              <LeadsWorkspace
                bots={bots}
                leads={leads}
                setLeads={setLeads}
                selectedBotId={leadAgentFilter}
                setSelectedBotId={setLeadAgentFilter}
                launchPublicChat={launchPublicChat}
                showToast={showToast}
              />
            ) : noAgentState}
          </PostLoginShell>
        )}

        {route.name === 'inbox' && (
          <PostLoginShell
            title="Inbox"
            subtitle="Review chat and voice conversations handled by the receptionist."
          >
            {activeBot ? <ConversationList activeBotId="all" /> : noAgentState}
          </PostLoginShell>
        )}

        {route.name === 'calendar' && (
          <PostLoginShell
            title="Calendar"
            subtitle="Connect your calendar and review bookings created by the receptionist."
          >
            <AppointmentsTab />
          </PostLoginShell>
        )}

        {route.name === 'calls' && (
          <PostLoginShell
            title="Calls"
            subtitle="Provision a phone agent and review inbound calls answered by your receptionist."
          >
            <CallsWorkspace
              bots={bots}
              activeBotId={activeBotId}
              setActiveBotId={setActiveBotId}
              showToast={showToast}
            />
          </PostLoginShell>
        )}

        {route.name === 'agents' && (
          <PostLoginShell
            title="Agents"
            subtitle="Manage receptionist profiles, website install, and preview links."
            actions={
              <button
                onClick={() => navigate('/agents/new')}
                className="px-4 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text rounded-lg text-sm font-bold transition"
              >
                Create Agent
              </button>
            }
          >
            <AgentsPage
              bots={bots}
              activeBotId={activeBotId}
              setActiveBotId={setActiveBotId}
              navigate={navigate}
              launchPublicChat={launchPublicChat}
              deleteBot={deleteBot}
              showToast={showToast}
            />
          </PostLoginShell>
        )}

        {route.name === 'agent-detail' && (
          <PostLoginShell
            title={routeBot?.businessName || 'Agent'}
            subtitle="Manage this receptionist's behavior, install script, and preview link."
            actions={
              <button
                onClick={() => navigate('/agents')}
                className="px-4 py-2.5 bg-brand-card hover:bg-brand-border border border-brand-border text-brand-text rounded-lg text-sm font-semibold transition"
              >
                All Agents
              </button>
            }
          >
            {routeBot ? (
              <AgentDetailPage
                bots={bots}
                setBots={setBots}
                activeBot={routeBot}
                tab={route.tab}
                navigate={navigate}
                launchPublicChat={launchPublicChat}
                showToast={showToast}
                updateBot={updateBot}
              />
            ) : noAgentState}
          </PostLoginShell>
        )}

        {route.name === 'public-chat' && activeBot && (
          <PublicChatView
            activeBot={activeBot}
            chatMessages={chat.chatMessages}
            chatInput={chat.chatInput}
            setChatInput={chat.setChatInput}
            isBotResponding={chat.isBotResponding}
            handleSendChatMessage={(e) => chat.sendMessage(e, (msg) => showToast(msg, 'error'))}
            sessionId={chat.currentSessionId}
            showSpeech={chat.showSpeech}
            setShowSpeech={chat.setShowSpeech}
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
            setView={legacySetView}
            showToast={showToast}
            messageEndRef={chat.messageEndRef}
            isStandalone={isStandaloneChat}
          />
        )}
      </main>

      {!isStandaloneChat && route.name !== 'landing' && <Footer showToast={(msg) => showToast(msg, 'success')} />}

      {newlyCreatedBotId && (
        <DeploymentSuccessModal
          botId={newlyCreatedBotId}
          subDomain={bots.find(b => b.id === newlyCreatedBotId)?.subDomain || ''}
          botName={bots.find(b => b.id === newlyCreatedBotId)?.businessName || ''}
          onClose={() => setNewlyCreatedBotId(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
