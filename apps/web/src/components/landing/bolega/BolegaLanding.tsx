import { useCallback, useEffect, useState, type ReactNode } from 'react';
import './landing.css';
import { HeroSection } from './HeroSection';
import { ContactCta, LandingFooter, LanguageWall, LeadStorySection, QuestionsSection } from './InteractiveSections';
import { LandingNav } from './LandingNav';
import { LandingProvider } from './LandingContext';
import { AmbientStickers, BrandValueSection, ContrastSection, Ticker, UseCasesSection } from './StaticSections';
import { WorkflowSection } from './WorkflowSection';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

interface BolegaLandingProps {
  navigate: (path: string) => void;
  signedIn: boolean;
  userMenu?: ReactNode;
}

/**
 * Bolega India marketing landing page. Styles are scoped under `.bi-landing` (see landing.css).
 * The reference page also contains a scripted call demo, a scroll story and a film strip; its approved
 * stylesheet hides them (`display: none !important`), so they are not rendered here.
 */
export function BolegaLanding({ navigate, signedIn, userMenu }: BolegaLandingProps) {
  const [motionPaused, setMotionPaused] = useState(() => window.matchMedia(REDUCED_MOTION).matches);
  const [recordingActive, setRecordingActive] = useState(false);

  // Follow the OS setting if it changes while the page is open.
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION);
    const onChange = () => setMotionPaused(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Page-level scroll behaviour from the approved design, only while the landing page is mounted.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('bi-landing-root');
    return () => html.classList.remove('bi-landing-root');
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.style.scrollBehavior = motionPaused ? 'auto' : '';
    return () => {
      html.style.scrollBehavior = '';
    };
  }, [motionPaused]);

  const toggleMotion = useCallback(() => setMotionPaused((paused) => !paused), []);

  const className = [
    'bi-landing',
    motionPaused ? 'motion-paused' : '',
    recordingActive ? 'hero-recording-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <LandingProvider motionPaused={motionPaused}>
      <div className={className}>
        <AmbientStickers />
        <LandingNav navigate={navigate} signedIn={signedIn} userMenu={userMenu} />
        <main>
          <HeroSection onSpeakingChange={setRecordingActive} />
          <Ticker />
          <WorkflowSection />
          <LanguageWall />
          <BrandValueSection />
          <ContrastSection />
          <LeadStorySection />
          <UseCasesSection />
          <QuestionsSection navigate={navigate} signedIn={signedIn} />
          <ContactCta navigate={navigate} signedIn={signedIn} />
        </main>
        <LandingFooter onToggleMotion={toggleMotion} />
      </div>
    </LandingProvider>
  );
}

export default BolegaLanding;
