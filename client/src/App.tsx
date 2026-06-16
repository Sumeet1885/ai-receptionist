import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';

// Types
import { Toast as ToastType } from './types';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useBots } from './hooks/useBots';
import { useLeads } from './hooks/useLeads';
import { useChat } from './hooks/useChat';

// Shared Components
import { Toast } from './components/common/Toast';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';

// Views
import { LandingView } from './components/landing/LandingView';
import { OnboardingView } from './components/onboarding/OnboardingView';
import { DashboardView } from './components/dashboard/DashboardView';
import { PublicChatView } from './components/chat/PublicChatView';
import { AuthView } from './components/auth/AuthView';

export default function App() {
  const [view, setView] = useState<string>('landing');
  const [toast, setToast] = useState<ToastType | null>(null);

  // Hooks
  const { user, signOut } = useAuth();
  const { bots, setBots, activeBotId, setActiveBotId, fetchBots, createBot, updateBot } = useBots();
  const { leads, setLeads, fetchLeads } = useLeads();
  const chat = useChat();

  // Onboarding Form State
  const [newBotName, setNewBotName] = useState('');
  const [newBotIndustry, setNewBotIndustry] = useState('Education');
  const [newBotGreeting, setNewBotGreeting] = useState('');
  const [newBotKB, setNewBotKB] = useState('');
  const [newBotColor, setNewBotColor] = useState('indigo');
  const [newBotLanguages, setNewBotLanguages] = useState<string[]>(['English']);

  // Dashboard state
  const [dashboardTab, setDashboardTab] = useState('leads');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch data when user logs in
  useEffect(() => {
    if (user) {
      fetchBots();
      fetchLeads();
      if (view === 'auth-signin' || view === 'auth-signup') {
        setView('dashboard');
      }
    } else if (view !== 'landing' && view !== 'public-chat') {
      // If we are on a standalone public chat URL, don't redirect to landing page
      const isPublicPath = window.location.pathname.startsWith('/chats/');
      if (!isPublicPath) {
        setView('landing');
      }
    }
  }, [user]);

  // Handle direct standalone public chatbot URL loading (/chats/:subdomain)
  useEffect(() => {
    const loadStandaloneChat = async () => {
      const path = window.location.pathname;
      const match = path.match(/^\/chats\/([^/]+)/);
      if (match) {
        const subdomain = match[1];
        try {
          // Fetch the bot with this subdomain from Supabase
          const { data, error } = await supabase
            .from('bots')
            .select('*')
            .eq('subdomain', subdomain)
            .single();

          if (error || !data) {
            showToast('Chatbot not found or inactive', 'error');
            setView('landing');
            return;
          }

          const mappedBot = {
            id: data.id,
            businessName: data.business_name,
            industry: data.industry,
            subDomain: data.subdomain,
            greeting: data.greeting,
            primaryColor: data.primary_color,
            languages: data.languages,
            knowledgeBase: data.knowledge_base,
            createdAt: data.created_at
          };

          // Save bot to state and set active
          setBots(prev => {
            if (prev.some(b => b.id === mappedBot.id)) return prev;
            return [...prev, mappedBot];
          });
          setActiveBotId(mappedBot.id);

          // Start the chat session
          await chat.startSession(mappedBot.id, mappedBot.greeting);
          setView('public-chat');
        } catch (err) {
          console.error('Error loading public chatbot:', err);
          showToast('Failed to load public chatbot', 'error');
          setView('landing');
        }
      }
    };

    loadStandaloneChat();
  }, []);

  // Poll leads when on dashboard
  useEffect(() => {
    if (view === 'dashboard' && user) {
      const interval = setInterval(() => {
        fetchLeads();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [view, user]);

  // Auto-scroll chat
  useEffect(() => {
    if (chat.messageEndRef.current) {
      chat.messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat.chatMessages]);

  // Onboarding templates
  const applyOnboardingTemplate = (industry: string) => {
    if (industry === 'Education') {
      setNewBotName('Alpha Education Institute');
      setNewBotGreeting('Welcome to Alpha Education! 🎓 How can I help you with details on engineering admissions, MBA courses, or fee structures today?');
      setNewBotKB(`Alpha Education Institute details:\n1. Available Programs:\n- Executive MBA (1 Year Program) - Fee: INR 2,50,000.\n- Master's in Computer Science (2 Years) - Fee: INR 1,80,000 per year.\n2. Admissions: Opens in June. Apply online on our portal.\n3. Office Location: Sector-5, Salt Lake, Kolkata.`);
    } else if (industry === 'Real Estate') {
      setNewBotName('Apex Horizon Estates');
      setNewBotGreeting('Welcome to Apex Horizon Estates! 🏢 Interested in our premium high-rise projects, commercial spaces, or planning a direct site visit?');
      setNewBotKB(`Apex Horizon Estates portfolio details:\n1. Active Project: "Horizon Heights" located in Kharadi, Pune.\n- Configurations: premium 2 BHK (INR 85 Lakhs onwards) and 3 BHK (INR 1.25 Cr onwards).\n- Amenities: Infinite swimming pool, sky garden, fully equipped modern gym.\n2. Site Visits: Open daily from 9:00 AM to 7:00 PM.`);
    } else if (industry === 'Recruitment') {
      setNewBotName('Recrui8 Tech Staffing');
      setNewBotGreeting('Hello! I am the Recrui8 Virtual HR Assistant. 💼 I can help you browse active technical openings, track candidate application status, or schedule interviews!');
      setNewBotKB(`Recrui8 Tech Staffing guide:\n1. Active Technical Openings:\n- Senior React Developer: Requires 5+ years of experience. Salary: 18-24 LPA.\n- AI Product Engineer: Requires expertise in LLMs, Gemini/OpenAI API integrations. Salary: 20-30 LPA.\n2. Candidate Application Process:\nSubmit Resume, GitHub Link, and complete a 45-minute coding challenge.`);
    } else if (industry === 'Other') {
      setNewBotName('');
      setNewBotGreeting('Welcome to our business! 🤖 How can our virtual assistant help you today?');
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
      await createBot({
        owner_id: user.id,
        business_name: newBotName,
        industry: newBotIndustry,
        subdomain: subDomain,
        greeting: newBotGreeting || `Welcome to ${newBotName}. 🤖 How can our virtual assistant help you today?`,
        primary_color: newBotColor,
        languages: newBotLanguages,
        knowledge_base: newBotKB || 'A general premium service business. Feel free to enquire about prices, hours and services.'
      });
      showToast('Chatbot generated! Your unique link is live.', 'success');
      setView('dashboard');
    } catch (err: any) {
      showToast('Error creating bot: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  const activeBot = bots.find(b => b.id === activeBotId) || (bots.length > 0 ? bots[0] : null);

  const isStandaloneChat = window.location.pathname.startsWith('/chats/');

  return (
    <div className={`bg-brand-bg text-brand-text font-sans antialiased flex flex-col selection:bg-brand-accent/30 selection:text-white ${isStandaloneChat ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {toast && <Toast toast={toast} />}

      {!isStandaloneChat && (
        <Header
          view={view}
          setView={setView}
          hasBots={bots.length > 0}
          activeBotId={activeBotId}
          launchPublicChat={launchPublicChat}
          user={user}
          signOut={signOut}
        />
      )}

      <main className="flex-1 flex flex-col">
        {view === 'landing' && (
          <LandingView
            setView={setView}
            setActiveBotId={setActiveBotId}
            applyOnboardingTemplate={applyOnboardingTemplate}
            launchPublicChat={launchPublicChat}
            user={user}
          />
        )}

        {(view === 'auth-signin' || view === 'auth-signup') && (
          <AuthView
            setView={setView}
            showToast={showToast}
            defaultMode={view === 'auth-signin' ? 'signin' : 'signup'}
          />
        )}

        {view === 'onboarding' && (
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
            newBotLanguages={newBotLanguages}
            setNewBotLanguages={setNewBotLanguages}
            setView={setView}
            handleCreateBot={handleCreateBot}
          />
        )}

        {view === 'dashboard' && (
          <DashboardView
            bots={bots}
            setBots={setBots}
            activeBotId={activeBotId}
            setActiveBotId={setActiveBotId}
            leads={leads}
            setLeads={setLeads}
            dashboardTab={dashboardTab}
            setDashboardTab={setDashboardTab}
            setView={setView}
            launchPublicChat={launchPublicChat}
            showToast={showToast}
            setNewBotName={setNewBotName}
            setNewBotGreeting={setNewBotGreeting}
            setNewBotKB={setNewBotKB}
            todos={[]}
            updateBot={updateBot}
          />
        )}

        {view === 'public-chat' && activeBot && (
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
            setView={setView}
            showToast={showToast}
            messageEndRef={chat.messageEndRef}
            isStandalone={isStandaloneChat}
          />
        )}
      </main>

      {!isStandaloneChat && view !== 'landing' && <Footer showToast={(msg) => showToast(msg, 'success')} />}
    </div>
  );
}
