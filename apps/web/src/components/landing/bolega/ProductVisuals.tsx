import { useEffect, useRef, useState } from 'react';
import { landingAssets } from './assets';
import { useInView, useLanding, usePauseWhenHidden } from './LandingContext';
import narratedMedia from './narratedMedia.json';
import { Play } from 'lucide-react';

const retailFilm = narratedMedia.find(item => item.id === 'retail-conversation')!;

/** A customer-enquiry film distinct from the setup walkthrough in Module 2. */
export function CustomerConversationFilm() {
  const [ref, visible] = useInView<HTMLElement>({ rootMargin: '200px' });
  const video = useRef<HTMLVideoElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  const { registerMedia, claimPlayback } = useLanding();
  useEffect(() => { if (visible) setLoaded(true); }, [visible]);
  useEffect(() => registerMedia('context-video', () => video.current?.pause()), [registerMedia]);
  useEffect(() => { if (!visible) video.current?.pause(); }, [visible]);
  usePauseWhenHidden(() => video.current?.pause());

  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const onChange = () => setPortrait(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const src = portrait ? landingAssets.customerConversationPortrait : landingAssets.customerConversationWide;
  const poster = portrait ? landingAssets.customerConversationPortraitPoster : landingAssets.customerConversationWidePoster;

  return (
    <figure ref={ref} className="product-film">
      <div className="workflow-video-frame">
      <video ref={video} controls playsInline preload="none" width={portrait ? 720 : 1280} height={portrait ? 960 : 720}
        src={loaded ? src : undefined} poster={poster} aria-label="New retail enquiry: an AI assistant helps a customer looking for a standing desk"
        onPlay={() => { setPlaying(true); setError(false); claimPlayback('context-video'); }}
        onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError(true); }}>
        <track kind="captions" src={landingAssets.customerConversationCaptions} srcLang="hi" label="Hindi dialogue" />
        A customer asks about a compact, height-adjustable desk, budget, and delivery in Pune.
      </video>
      <button type="button" className={`workflow-picture-toggle${playing ? ' is-playing' : ''}`} aria-label={playing ? 'Pause retail conversation' : 'Play retail conversation'} onClick={() => {
        const element = video.current;
        if (!element) return;
        if (!element.paused) element.pause();
        else { setError(false); element.play().catch(() => setError(true)); }
      }}>{!playing && <span><Play size={26} fill="currentColor" aria-hidden="true" /><span>Play conversation</span></span>}</button>
      </div>
      {error && <p role="status" className="moment-error">Playback could not start. Please try again.</p>}
      <figcaption><span>A NEW CONVERSATION / {Math.round(retailFilm.duration)} SECONDS</span><span>Retail enquiry</span></figcaption>
    </figure>
  );
}

export function ReceptionistPortrait({ className = '', variant }: { className?: string; variant: 'business' | 'closing' }) {
  const business = variant === 'business';
  return <img className={`receptionist-portrait ${className}`}
    src={business ? landingAssets.businessFemaleAssistant : landingAssets.closingAiAssistant}
    srcSet={business
      ? `${landingAssets.businessFemaleAssistantSmall} 600w, ${landingAssets.businessFemaleAssistant} 1200w`
      : `${landingAssets.closingAiAssistantSmall} 600w, ${landingAssets.closingAiAssistant} 1200w`}
    width="1200" height="1200"
    sizes="(max-width: 700px) 100vw, 50vw" loading="lazy" decoding="async"
    alt={business ? 'Indian female human–AI receptionist with a headset, forest-green jacket, and subtle ceramic AI details' : 'Mostly robotic AI receptionist with human warmth around both eyes and a smile, blended with ivory ceramic and forest-green mechanisms throughout'} />;
}
