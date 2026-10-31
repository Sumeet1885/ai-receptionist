import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_LIST } from '@ai-receptionist/contracts';
import { AppLink } from './AppLink';
import { LandingDialog } from './LandingDialog';
import { useInView, useLanding, usePauseWhenHidden } from './LandingContext';
import { Reveal } from './Reveal';
import { openSupport } from '../../../lib/supportDrawer';
import { sectionTexture } from './sectionTextures';
import { CustomerConversationFilm, ReceptionistPortrait } from './ProductVisuals';
import { ConversationExplorer } from './ConversationExplorer';

// [shown text, "romanised · language", BCP 47 language] for the 11 landing-page languages.
const allGreetings = SUPPORTED_LANGUAGES.map((l): [string, string, string] => [l.greeting, `${l.romanised} · ${l.name}`, l.code]);
const greetings = allGreetings.slice(0, 6);
const greetingsReverse = allGreetings.slice(6);

export function LanguageWall() {
  const { motionPaused, registerMedia, claimPlayback } = useLanding();
  const [ref, visible] = useInView<HTMLElement>();
  const audio = useRef<HTMLAudioElement | null>(null);
  const requestSerial = useRef(0);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [note, setNote] = useState('Tap a hello to hear it in that language.');
  const pause = useCallback(() => audio.current?.pause(), []);
  useEffect(() => registerMedia('language-greeting', pause), [registerMedia, pause]);
  useEffect(() => { if (!visible) pause(); }, [visible, pause]);
  usePauseWhenHidden(pause);

  const greet = (e: MouseEvent<HTMLButtonElement>, shown: string, name: string, lang: string) => {
    setNote(`${shown} — ${name}`);
    const element = audio.current;
    if (element) {
      const request = ++requestSerial.current;
      element.pause();
      element.dataset.language = lang;
      element.src = `/bolegaindia/audio/greetings/${lang}.mp3`;
      element.play().catch((reason: unknown) => {
        if (request !== requestSerial.current || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setSpeaking(null);
        setNote('The greeting could not play. Tap a hello to try again.');
      });
    }
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
        <button key={i} type="button" className="word-pill" lang={lang} aria-label={`Hear ${SUPPORTED_LANGUAGES.find(language => language.code === lang)?.name} greeting`} aria-pressed={speaking === lang} onClick={(e) => greet(e, shown, name, lang)}>
          {shown}
        </button>
      ))}
    </div>
  );

  return (
    <section ref={ref} style={sectionTexture('languages')} id="languages" className="language-wall">
      <Reveal>
        <span className="eyebrow">06 / FAMILIAR FEELS BETTER</span>
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
      <audio ref={audio} preload="none" onPlay={() => { setSpeaking(audio.current?.dataset.language || null); claimPlayback('language-greeting'); }} onPause={() => setSpeaking(null)} onEnded={() => setSpeaking(null)} onError={() => { setSpeaking(null); setNote('The greeting could not play. Tap a hello to try again.'); }} />
    </section>
  );
}

export function LeadStorySection() {
  return (
    <section style={sectionTexture('leads')} className="meaning-section lead-story-section" id="lead-story">
      <Reveal className="meaning-heading">
        <div>
          <span className="eyebrow">06 / PREPARE FOR A BETTER FOLLOW-UP</span>
          <h2>
            Your next conversation.{' '}
            <em>Already informed.</em>
          </h2>
        </div>
        <p>
          Review the customer&apos;s own words.
          <br />
          Bring the right questions to your follow-up.
        </p>
      </Reveal>
      <CustomerConversationFilm />
      <ConversationExplorer />
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
    <section style={sectionTexture('questions')} className="meaning-section questions-section" id="questions">
      <Reveal className="questions-intro">
        <div className="questions-illustration" aria-hidden="true"><span>hello.</span><span>Let’s talk.</span><i>?</i></div>
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
        <AppLink className="btn light" to={signedIn ? '/dashboard' : '/request-access'} navigate={navigate}>
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
    <Reveal style={sectionTexture('contact')} as="section" className="contact visual-contact" id="get-started">
      <div className="contact-copy">
        <span className="eyebrow">YOUR NEXT HELLO STARTS HERE</span>
        <h2>
          Ab business
          <br />
          <em>bolega.</em>
        </h2>
        <AppLink className="btn" to={signedIn ? '/agents/new' : '/request-access'} navigate={navigate}>
          Build your business persona <span>↗</span>
        </AppLink>
        <div className="cta-sub">Start with your business. Make every conversation count.</div>
      </div>
      <div className="contact-portrait"><ReceptionistPortrait variant="closing" /><span className="contact-hello" aria-hidden="true">Your next hello. ↗</span></div>
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
    a: `${SUPPORTED_LANGUAGE_LIST}.`,
  },
];

export function LandingFooter() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  return (
    <>
      <footer style={sectionTexture('footer')} className="footer">
        <a className="brand" href="#" aria-label="Bolega India, back to top">
          <span className="footer-wordmark">BolegaIndia<span>.ai</span></span>
        </a>
        <div className="footer-links">
          <button className="language" id="about" type="button" onClick={() => setAboutOpen(true)}>
            A little clarity ↗
          </button>
          <button type="button" className="language" onClick={() => openSupport({ view: 'new' })}>Contact support ↗</button>
          <a className="language" href="/privacy">Privacy</a>
          <a className="language" href="/terms">Terms</a>
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
