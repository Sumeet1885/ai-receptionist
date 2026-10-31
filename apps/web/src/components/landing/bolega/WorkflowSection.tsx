import { useCallback, useEffect, useRef, useState } from 'react';
import { landingAssets } from './assets';
import { useLanding, usePauseWhenHidden } from './LandingContext';
import { Reveal } from './Reveal';
import { sectionTexture } from './sectionTextures';

const PORTRAIT_QUERY = '(max-width: 700px)';
const chapters = ['01 Persona', '02 Contacts', '03 Schedule', '04 Conversation', '05 Lead'];
const CHAPTER_SECONDS = 4;

function sourceFor(portrait: boolean) {
  return portrait
    ? { src: landingAssets.productStoryPortrait, poster: landingAssets.productStoryPortraitPoster }
    : { src: landingAssets.productStoryWide, poster: landingAssets.productStoryWidePoster };
}

/** Muted, looping product walkthrough with a responsive source and chapter shortcuts. */
export function WorkflowSection() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const manualPause = useRef(false);
  const visibleRef = useRef(false);
  const { claimPlayback, registerMedia, setWorkflowPlayer, motionPaused } = useLanding();
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia(PORTRAIT_QUERY).matches);
  const [paused, setPaused] = useState(true);
  const [activeChapter, setActiveChapter] = useState(0);
  const { src, poster } = sourceFor(portrait);

  const tryPlay = useCallback(() => {
    // Browsers may refuse playback (data saver, autoplay policy); the poster and play button remain.
    videoRef.current?.play().catch(() => setPaused(true));
  }, []);

  const pause = useCallback(() => videoRef.current?.pause(), []);
  useEffect(() => registerMedia('workflow-video', pause), [registerMedia, pause]);
  usePauseWhenHidden(pause);
  useEffect(() => { if (motionPaused) pause(); }, [motionPaused, pause]);

  useEffect(() => {
    setWorkflowPlayer(() => {
      manualPause.current = false;
      tryPlay();
    });
    return () => setWorkflowPlayer(null);
  }, [setWorkflowPlayer, tryPlay]);

  // Swap between the portrait and wide films at the breakpoint, keeping position and play state.
  useEffect(() => {
    const query = window.matchMedia(PORTRAIT_QUERY);
    const onChange = () => setPortrait(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const lastSrc = useRef(src);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || lastSrc.current === src) return;
    lastSrc.current = src;
    const at = video.currentTime;
    const wasPlaying = !video.paused;
    const onMeta = () => {
      video.currentTime = Math.min(at || 0, 19);
      if ((wasPlaying || (visibleRef.current && !motionPaused)) && !manualPause.current) tryPlay();
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.load();
    return () => video.removeEventListener('loadedmetadata', onMeta);
  }, [src, tryPlay, motionPaused]);

  // Play only while visible, unless the visitor paused it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      (entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? false;
        if (visibleRef.current && !manualPause.current && !motionPaused && !document.hidden) tryPlay();
        else video.pause();
      },
      { threshold: 0.12 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [tryPlay, motionPaused]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    const onPlay = () => {
      setPaused(false);
      claimPlayback('workflow-video');
    };
    const onPause = () => setPaused(true);
    const onTime = () => setActiveChapter(Math.min(chapters.length - 1, Math.floor(video.currentTime / CHAPTER_SECONDS)));
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
    };
  }, [claimPlayback]);

  const togglePause = () => {
    const video = videoRef.current;
    if (!video) return;
    manualPause.current = !video.paused;
    if (manualPause.current) video.pause();
    else tryPlay();
  };

  const jumpTo = (index: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = index * CHAPTER_SECONDS + 0.1;
    setActiveChapter(index);
    const top = (sectionRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
    window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
    manualPause.current = false;
    tryPlay();
  };

  return (
    <section style={sectionTexture('workflow')} ref={sectionRef} className="section video-section" id="workflow">
      <span className="section-sticker" aria-hidden="true">
        From hello
        <br />
        to what’s next ↗
      </span>
      <Reveal className="heading">
        <div>
          <span className="eyebrow">SEE THE WHOLE PICTURE / 30 SECONDS</span>
          <h2>
            Your business in.
            <br />
            <em>Better leads out.</em>
          </h2>
        </div>
        <span className="hint">A persona. A contact list. A conversation that goes somewhere.</span>
      </Reveal>
      <Reveal className="walkthrough-player">
        <video
          ref={videoRef}
          id="workflow-video"
          muted
          loop
          playsInline
          preload="auto"
          poster={poster}
          src={src}
          aria-label="Bolega India 20-second animated product story: business persona, CSV contacts, scheduled calls, qualification, leads and transcripts"
        >
          <track kind="captions" src={landingAssets.productStoryCaptions} srcLang="en" label="English" />
        </video>
        <div className="film-chapters" role="group" aria-label="Replay a chapter">
          {chapters.map((chapter, i) => (
            <button
              key={chapter}
              type="button"
              className={activeChapter === i ? 'active' : undefined}
              aria-pressed={activeChapter === i}
              onClick={() => jumpTo(i)}
            >
              {chapter}
            </button>
          ))}
        </div>
        <div className={`film-status${paused ? ' paused' : ''}`} id="film-status">
          <i />
          <span>{paused ? 'PRODUCT STORY / PAUSED' : 'PRODUCT IN MOTION'}</span>
        </div>
        <button
          id="film-pause"
          className="film-pause"
          type="button"
          onClick={togglePause}
          aria-label={paused ? 'Resume product video' : 'Pause product video'}
        >
          {paused ? '▶' : 'Ⅱ'}
        </button>
      </Reveal>
      <div className="video-caption">
        <span>Persona → CSV → Schedule → AI conversation → Lead + transcript</span>
        <span>Illustrative walkthrough · No audio</span>
      </div>
    </section>
  );
}
