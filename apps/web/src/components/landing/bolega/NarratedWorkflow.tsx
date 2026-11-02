import { useCallback, useEffect, useRef, useState } from 'react';
import { landingAssets } from './assets';
import media from './narratedMedia.json';
import { useInView, useLanding, usePauseWhenHidden } from './LandingContext';
import { sectionTexture } from './sectionTextures';
import { Play } from 'lucide-react';

const film = media.find(item => item.id === 'how-it-works')!;

/** User-initiated narration with native playback controls and responsive sources. */
export function NarratedWorkflow() {
  const video = useRef<HTMLVideoElement | null>(null);
  const [ref, visible] = useInView<HTMLElement>();
  const [loaded, setLoaded] = useState(false);
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const pendingPlayback = useRef(false);
  const savedPosition = useRef(0);
  const { registerMedia, claimPlayback, setWorkflowPlayer } = useLanding();
  const pause = useCallback(() => video.current?.pause(), []);
  const play = useCallback(() => {
    setLoaded(true); setError(false);
    pendingPlayback.current = true;
    ref.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    if (video.current?.getAttribute('src')) {
      video.current.play().catch(() => setError(true));
    }
  }, [ref]);

  useEffect(() => { if (visible) setLoaded(true); else if (!pendingPlayback.current) pause(); }, [visible, pause]);
  useEffect(() => {
    if (loaded && pendingPlayback.current) video.current?.play().catch(() => setError(true));
  }, [loaded]);
  useEffect(() => registerMedia('workflow-video', pause), [registerMedia, pause]);
  usePauseWhenHidden(pause);
  useEffect(() => { setWorkflowPlayer(play); return () => setWorkflowPlayer(null); }, [play, setWorkflowPlayer]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const change = () => {
      savedPosition.current = video.current?.currentTime || 0;
      pause(); setPortrait(query.matches);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, [pause]);

  return (
    <section ref={ref} style={sectionTexture('workflow')} className="narrated-workflow" id="workflow">
      <div className="meaning-section">
        <div className="meaning-heading"><div><span className="eyebrow">04 / HOW BOLEGAINDIA.AI WORKS</span><h2>Your business in. <em>Better conversations out.</em></h2></div><p>From your persona to your next follow-up.</p></div>
        <figure className="workflow-film">
          <div className="workflow-video-frame">
          <video ref={video} id="workflow-video" controls playsInline preload={savedPosition.current > 0 ? 'metadata' : 'none'} width={portrait ? 720 : 1280} height={portrait ? 960 : 720}
            src={loaded ? (portrait ? landingAssets.productStoryPortrait : landingAssets.productStoryWide) : undefined}
            poster={portrait ? landingAssets.productStoryPortraitPoster : landingAssets.productStoryWidePoster}
            aria-label="Narrated BolegaIndia.ai product walkthrough: persona, contacts, starting calls, conversations, and follow-up"
            onPlay={() => { pendingPlayback.current = false; setPlaying(true); claimPlayback('workflow-video'); setError(false); }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => { pendingPlayback.current = false; setError(true); }}
            onLoadedMetadata={() => {
              const element = video.current;
              if (!element) return;
              if (savedPosition.current > 0) {
                element.currentTime = Math.min(savedPosition.current, element.duration || film.duration);
                savedPosition.current = 0;
              }
              if (pendingPlayback.current) {
                pendingPlayback.current = false;
                element.play().catch(() => setError(true));
              }
            }}>
            <track kind="captions" src={landingAssets.productStoryCaptions} srcLang="en" label="English narration" />
            Create your business persona, upload contacts, connect a phone line, start your campaign, and review leads and transcripts.
          </video>
          <button type="button" className={`workflow-picture-toggle${playing ? ' is-playing' : ''}`} aria-label={playing ? 'Pause product walkthrough' : 'Play product walkthrough'} onClick={() => {
            if (video.current && !video.current.paused) pause();
            else play();
          }}>{!playing && <span><Play size={26} fill="currentColor" aria-hidden="true" /><span>Play walkthrough</span></span>}</button>
          </div>
          <figcaption><span>HOW IT WORKS / {Math.round(film.duration)} SECONDS</span><span>Sound on</span></figcaption>
        </figure>
        {error && <p role="status" className="workflow-error">Playback could not start. Use the video’s play button to try again.</p>}
      </div>
    </section>
  );
}
