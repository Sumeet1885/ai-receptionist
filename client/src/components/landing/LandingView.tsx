import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';

interface LandingViewProps {
  setView: (view: string) => void;
  setActiveBotId: (botId: string) => void;
  applyOnboardingTemplate: (industry: string) => void;
  launchPublicChat: (botId: string) => void;
  user: any;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const mapRange = (
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number
) => {
  const progress = clamp((value - inputMin) / (inputMax - inputMin));
  return outputMin + (outputMax - outputMin) * progress;
};

const channels = [
  { name: 'Voice calls', detail: 'Answers inbound calls, asks questions, and books appointments.' },
  { name: 'Website chat', detail: 'Same AI agent embedded on your website to assist visitors 24/7.' },
  { name: 'Lead capture', detail: 'Automatically extracts name, phone, requirements, and sentiment.' }
];

const industries = [
  { name: 'Healthcare', detail: 'Doctor timings, fees, location, and appointment booking.' },
  { name: 'Recruitment', detail: 'Job openings, interview status, and application tracking.' },
  { name: 'Real estate', detail: 'Property details, pricing, and site visit scheduling.' },
  { name: 'Education', detail: 'Admissions, course details, batches, and fee structure.' }
];

const aiFeatures = ['Call summary', 'Sentiment analysis', 'Lead scoring', 'Multi-language support'];
const storyCount = 6;

export const LandingView: React.FC<LandingViewProps> = ({
  setView,
  setActiveBotId,
  applyOnboardingTemplate,
  launchPublicChat,
  user
}: LandingViewProps) => {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const updateProgress = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const scrollable = Math.max(1, sectionRef.current.offsetHeight - window.innerHeight);
      setScrollProgress(clamp(-rect.top / scrollable));
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const motion = useMemo(() => {
    const p = scrollProgress;
    return {
      greenOpacity: mapRange(p, 0.05, 0.16, 0, 1),
      heroOpacity: mapRange(p, 0.03, 0.13, 1, 0),
      heroY: mapRange(p, 0, 0.22, 0, -64),
      heroScale: mapRange(p, 0, 0.18, 1, 0.94),
      deviceY: mapRange(p, 0, 0.16, 300, -132),
      deviceScale: mapRange(p, 0, 0.16, 0.78, 1),
      panelY: mapRange(p, 0.04, 0.16, 92, 0),
      storyStackY: -mapRange(p, 0.18, 0.82, 0, storyCount - 1) * 100
    };
  }, [scrollProgress]);

  const createBot = () => {
    setView('onboarding');
    applyOnboardingTemplate('Education');
  };

  const openDashboard = () => {
    setActiveBotId('apex-academy');
    setView('dashboard');
  };

  return (
    <>
    <div ref={sectionRef} className="landing-cinema landing-product-cinema">
      <section className="landing-sticky-stage">
        <div className="landing-emerald-field" style={{ opacity: motion.greenOpacity }} aria-hidden="true" />

        <div
          className="landing-hero-copy landing-product-hero"
          style={{
            opacity: motion.heroOpacity,
            transform: `translate3d(0, ${motion.heroY}px, 0) scale(${motion.heroScale})`
          }}
        >
          <span className="landing-kicker">
            <Icons.Sparkles />
            Virtual employee available 24x7
          </span>

          <h1>
            Meet your
            <br />
            always-on
            <br />
            <span className="landing-fingerprint">AI</span> Receptionist
          </h1>

          <p>
            One AI agent that answers calls, chats on your website,
            books appointments, captures leads, and scores every interaction.
          </p>

          <button 
            className="landing-primary-cta" 
            onClick={() => user ? setView('dashboard') : setView('auth-signup')}
          >
            Create your receptionist
          </button>
        </div>

        <div
          className="landing-device landing-product-device"
          style={{
            transform: `translate3d(-50%, ${motion.deviceY}px, 0) scale(${motion.deviceScale})`
          }}
        >
          <div className="landing-device-top">
            <div className="landing-mini-brand">
              I Receptionist<span>.ai</span>
            </div>
            <div className="landing-mini-nav">
              <span>Voice</span>
              <span>Chat</span>
              <span>Leads</span>
              <span>Booking</span>
            </div>
            <button onClick={openDashboard}>Console</button>
          </div>

          <div
            className="landing-white-panel landing-product-panel"
            style={{
              transform: `translate3d(0, ${motion.panelY}px, 0)`
            }}
          >
            <div
              className="landing-scene-stack"
              style={{ transform: `translate3d(0, ${motion.storyStackY}%, 0)` }}
            >
              <section className="landing-story-panel landing-call-section">
                <div className="landing-prompt-pill">
                  <span>Customer calls: "I want to book an appointment."</span>
                  <div>
                    <button onClick={() => launchPublicChat('apex-academy')}>Try</button>
                    <button onClick={createBot}>Deploy</button>
                  </div>
                </div>
                <span className="landing-section-eyebrow">What it does</span>
                <h2>
                  Answers calls <span>automatically</span>
                </h2>
                <p>
                  It understands natural language, asks the right follow-up questions,
                  and turns a call into an appointment or qualified lead.
                </p>

                <div className="landing-language-strip">
                  {['English', 'Hindi', 'Marathi', 'Tamil', 'Multiple languages'].map(language => (
                    <span key={language}>{language}</span>
                  ))}
                </div>

                <div className="landing-call-stage">
                  <article className="landing-call-bubble landing-customer-bubble">
                    <span>Customer</span>
                    <strong>I want to book an appointment.</strong>
                  </article>
                  <article className="landing-call-bubble landing-ai-bubble">
                    <span>AI Receptionist</span>
                    <strong>Certainly. May I know your preferred date and time?</strong>
                  </article>
                </div>
              </section>

              <section className="landing-story-panel landing-channel-section">
                <span className="landing-section-eyebrow">One agent everywhere</span>
                <h2>
                  Voice + Website chat <span>unified</span>
                </h2>
                <p>
                  Customers can call or chat. The same receptionist keeps context
                  and automatically books appointments with Google Calendar or Outlook.
                </p>

                <div className="landing-channel-grid">
                  {channels.map(channel => (
                    <article key={channel.name} className="landing-channel-card">
                      <span>{channel.name}</span>
                      <p>{channel.detail}</p>
                    </article>
                  ))}
                </div>

                <div className="landing-integration-rail">
                  <span>Google Calendar</span>
                  <span>Lead Scoring</span>
                  <span>Appointment Booking</span>
                </div>
              </section>

              <section className="landing-story-panel landing-crm-section">
                <div className="landing-lead-copy">
                  <span className="landing-section-eyebrow">Lead capture</span>
                  <h2>
                    Every inquiry becomes a <span>scored lead</span>
                  </h2>
                  <p>Name, phone, requirement, budget, sentiment, and appointment status are captured automatically.</p>
                </div>

                <div className="landing-product-crm-card">
                  {['Name', 'Phone', 'Requirement', 'Budget'].map(field => (
                    <div key={field}>
                      <span>{field}</span>
                      <strong>{field === 'Name' ? 'Amit Deshmukh' : field === 'Phone' ? '+91 98812 34567' : field === 'Requirement' ? 'Admission callback' : 'Flexible'}</strong>
                    </div>
                  ))}
                  <p>Summary: High-intent visitor asked for course details and requested a callback.</p>
                </div>
              </section>

              <section className="landing-story-panel landing-industry-section">
                <span className="landing-section-eyebrow">Industry-specific versions</span>
                <h2>
                  Built for the front desk your <span>business actually has</span>
                </h2>

                <div className="landing-industry-grid">
                  {industries.map(industry => (
                    <article key={industry.name} className="landing-industry-card">
                      <span>{industry.name}</span>
                      <p>{industry.detail}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="landing-story-panel landing-intelligence-section">
                <span className="landing-section-eyebrow">AI features</span>
                <h2>
                  Summaries, sentiment, scoring, and <span>multi-language</span>
                </h2>
                <p>
                  Detect angry customers, urgent issues, high-value leads, and call outcomes
                  across multiple languages without manual review.
                </p>

                <div className="landing-ai-feature-grid">
                  {aiFeatures.map(feature => (
                    <article key={feature}>
                      <span>{feature}</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="landing-story-panel landing-product-dark-story landing-final-story">
                <div>
                  <h2>
                    <span>One AI receptionist</span> handling every first response
                  </h2>
                  <p>
                    Calls and website chats become booked appointments, scored leads,
                    call summaries, and sentiment insights.
                  </p>
                  <button onClick={createBot}>Configure your AI receptionist</button>
                </div>
                <div className="landing-floating-bubble landing-floating-bubble-a">
                  <span>Sentiment</span>
                  <strong>Urgent issue detected</strong>
                </div>
                <div className="landing-floating-bubble landing-floating-bubble-b">
                  <span>Lead score</span>
                  <strong>HOT lead pushed to CRM</strong>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      <div className="landing-scroll-spacer" aria-hidden="true" />
    </div>
    <footer className="landing-site-footer">
      <div>
        <span>AI Receptionist</span>
        <p>One 24x7 AI receptionist for calls, website chat, appointment booking, and lead scoring.</p>
      </div>
      <nav aria-label="Footer">
        <button onClick={createBot}>Configure Agent</button>
        <button onClick={openDashboard}>Open Console</button>
        <button onClick={() => launchPublicChat('apex-academy')}>Try Live Agent</button>
      </nav>
    </footer>
    </>
  );
};
