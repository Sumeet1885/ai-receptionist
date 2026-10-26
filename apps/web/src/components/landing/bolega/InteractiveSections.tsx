import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { BrandLogo } from '../../ui/brand-logo';
import { AppLink } from './AppLink';
import { LandingDialog } from './LandingDialog';
import { useInView, useLanding } from './LandingContext';
import { Reveal } from './Reveal';

const greetings: [string, string, string][] = [
  // [shown text, romanised name, BCP 47 language]
  ['नमस्ते', 'Namaste', 'hi'],
  ['Hello', 'Hello', 'en'],
  ['வணக்கம்', 'Vanakkam', 'ta'],
  ['నమస్కారం', 'Namaskaram', 'te'],
  ['নমস্কার', 'Namaskar', 'bn'],
];
const greetingsReverse: [string, string, string][] = [
  ['ನಮಸ್ಕಾರ', 'Namaskara', 'kn'],
  ['ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'Sat Sri Akal', 'pa'],
  ['નમસ્તે', 'Namaste', 'gu'],
  ['നമസ്കാരം', 'Namaskaram', 'ml'],
  ['आदाब', 'Adaab', 'hi'],
];

export function LanguageWall() {
  const { motionPaused } = useLanding();
  const [note, setNote] = useState('Tap a hello to animate it · Language inspiration, not a production support list.');

  const greet = (e: MouseEvent<HTMLButtonElement>, shown: string, name: string) => {
    setNote(`${shown} — ${name}`);
    if (!motionPaused) {
      e.currentTarget.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.15) rotate(-5deg)' }, { transform: 'scale(1)' }],
        { duration: 450 },
      );
    }
  };

  const belt = (items: [string, string, string][], reverse: boolean) => (
    <div className={`language-belt${reverse ? ' reverse' : ''}`}>
      {[...items, ...items].map(([shown, name, lang], i) => (
        <button key={i} type="button" className="word-pill" lang={lang} onClick={(e) => greet(e, shown, name)}>
          {shown}
        </button>
      ))}
    </div>
  );

  return (
    <section id="languages" className="language-wall">
      <Reveal>
        <span className="eyebrow">03 / FAMILIAR FEELS BETTER</span>
        <h2>
          Many ways to say hello.
          <br />
          <em>One India.</em>
        </h2>
      </Reveal>
      {belt(greetings, false)}
      {belt(greetingsReverse, true)}
      <div className="hint" id="greeting-note" role="status">
        {note}
      </div>
    </section>
  );
}

const facts = [
  { label: 'REQUIREMENT', value: 'A solution for a growing team' },
  { label: 'PRIORITIES', value: 'Fit, pricing, and setup time' },
  { label: 'NEXT STEP', value: 'A conversation with your team' },
];
const transcript = [
  { ask: '“What are you looking for?”', answer: '“Something that works for our growing team.”' },
  { ask: '“What would help you decide?”', answer: '“The right fit, pricing, and how soon we can start.”' },
  { ask: '“Would you like our team to follow up?”', answer: '“Yes. I’d like to discuss it.”' },
];

export function LeadStorySection() {
  const { motionPaused } = useLanding();
  const [sectionRef, visible] = useInView<HTMLElement>();
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    if (!visible || motionPaused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setFactIndex((i) => (i + 1) % facts.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [visible, motionPaused]);

  return (
    <section ref={sectionRef} className="meaning-section lead-story-section" id="lead-story">
      <Reveal className="meaning-heading">
        <div>
          <span className="eyebrow">06 / PREPARE FOR A BETTER FOLLOW-UP</span>
          <h2>
            Your next conversation.
            <br />
            <em>Already informed.</em>
          </h2>
        </div>
        <p>
          Review the customer&apos;s own words.
          <br />
          Bring the right questions to your follow-up.
        </p>
      </Reveal>
      <Reveal className="lead-story-grid">
        <article className="result-card">
          <div className="result-card-top">
            <span className="eyebrow">ILLUSTRATIVE CUSTOMER ENQUIRY</span>
            <span className="ready-pill">Intent captured</span>
          </div>
          <div className="result-person">
            <span aria-hidden="true">AK</span>
            <div>
              <h3>Aarav Kumar</h3>
              <small>New business enquiry</small>
            </div>
          </div>
          {facts.map((fact, i) => (
            <div key={fact.label} className={`lead-fact${factIndex === i ? ' active' : ''}`} data-fact={i}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
              <i>{String(i + 1).padStart(2, '0')}</i>
            </div>
          ))}
          <div className="result-footer">✦ &nbsp; Your qualification criteria. Useful customer context.</div>
        </article>
        <article className="transcript-story">
          <div className="transcript-story-top">
            <span className="eyebrow">THE REASON BEHIND THE REQUIREMENT</span>
            <span className="transcript-live">
              <i /> Sample transcript
            </span>
          </div>
          {transcript.map((pair, i) => (
            <div key={i} className={`transcript-pair${factIndex === i ? ' active' : ''}`} data-transcript={i}>
              <span className="transcript-role">AI PERSONA</span>
              <p>{pair.ask}</p>
              <div className="customer-quote">{pair.answer}</div>
            </div>
          ))}
        </article>
      </Reveal>
      <div className="meaning-bottom">
        <span>Illustrative conversation · Not a live call result</span>
        <span className="autoplay-caption">
          See the context behind each priority <i />
        </span>
      </div>
    </section>
  );
}

/** Product FAQ. Answers describe what the product does today. */
const questions = [
  {
    q: 'What is a business persona?',
    a: 'It’s the business context you give your AI: your offering, important details, conversation language and tone, and the questions it should ask.',
  },
  {
    q: 'How do I add people to a campaign?',
    a: 'You upload a CSV or Excel contact list to a campaign. When you start the campaign, your persona begins calling those contacts.',
  },
  {
    q: 'Can I choose when calls begin?',
    a: 'You start each campaign when you are ready, and calls are paced within hourly limits. Choosing a future date and time for a campaign is not available yet.',
  },
  {
    q: 'What do I get after a conversation?',
    a: 'A lead record with the requirement and qualification context, alongside the transcript. Your team can review what was said before following up.',
  },
  {
    q: 'Is Bolega India only for one industry?',
    a: 'No. You shape the persona around your business and its questions. The education, services, retail, and real-estate scenarios are examples.',
  },
  {
    q: 'Can I place real calls?',
    a: 'Yes, after you sign in and connect a phone line to your agent. The conversations on this page are recorded or scripted samples, not live calls.',
  },
];

interface CtaProps {
  navigate: (path: string) => void;
  signedIn: boolean;
}

export function QuestionsSection({ navigate, signedIn }: CtaProps) {
  return (
    <section className="meaning-section questions-section" id="questions">
      <Reveal className="questions-intro">
        <span className="eyebrow">08 / A LITTLE CLARITY</span>
        <h2>
          Good questions.
          <br />
          <em>Clear answers.</em>
        </h2>
        <p>
          Everything starts with understanding
          <br />
          your business and your customers.
        </p>
        <AppLink className="btn light" to={signedIn ? '/dashboard' : '/auth?mode=signup'} navigate={navigate}>
          {signedIn ? 'Go to your dashboard ↗' : 'Explore getting started ↗'}
        </AppLink>
      </Reveal>
      <Reveal className="questions-list">
        {questions.map(({ q, a }, i) => (
          <details key={q} open={i === 0}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </Reveal>
    </section>
  );
}

export function ContactCta({ navigate, signedIn }: CtaProps) {
  return (
    <Reveal as="section" className="contact">
      <span className="eyebrow">YOUR NEXT HELLO STARTS HERE</span>
      <h2>
        Ab business
        <br />
        <em>bolega.</em>
      </h2>
      <AppLink className="btn" to={signedIn ? '/agents/new' : '/auth?mode=signup'} navigate={navigate}>
        Build your business persona <span>↗</span>
      </AppLink>
      <div className="cta-sub">Start with your business. Make every conversation count.</div>
    </Reveal>
  );
}

const clarity = [
  {
    q: 'Is the conversation on this page a real AI phone call?',
    a: 'No. The hero plays a recorded conversation and the call demo uses scripted samples. Live calls run from your dashboard once a phone line is connected.',
  },
  {
    q: 'Which languages are supported?',
    a: 'Samples illustrate English, Hindi, and Hinglish. The greeting wall celebrates India’s languages; it does not promise production language coverage.',
  },
];

export function LandingFooter({ onToggleMotion }: { onToggleMotion: () => void }) {
  const { motionPaused } = useLanding();
  const [aboutOpen, setAboutOpen] = useState(false);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  return (
    <>
      <footer className="footer">
        <a className="brand" href="#" aria-label="Bolega India, back to top">
          <BrandLogo bare mark="logo" />
        </a>
        <div className="footer-links">
          <button className="language" id="motion-toggle" type="button" aria-pressed={motionPaused} onClick={onToggleMotion}>
            {motionPaused ? 'Resume motion' : 'Pause motion'}
          </button>
          <button className="language" id="about" type="button" onClick={() => setAboutOpen(true)}>
            A little clarity ↗
          </button>
        </div>
        <small>
          bolegaindia.ai
          <br />© 2026 Bolega India
        </small>
      </footer>
      <LandingDialog id="about-dialog" open={aboutOpen} onClose={closeAbout} closeLabel="Close information">
        <h3>A little clarity.</h3>
        {clarity.map(({ q, a }, i) => (
          <details key={q} className="faq-item" open={i === 0}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </LandingDialog>
    </>
  );
}
