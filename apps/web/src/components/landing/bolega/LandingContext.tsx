import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';

export type LandingMedia = 'hero-audio' | 'workflow-video' | 'context-video' | 'context-audio' | 'conversation-reel' | 'language-greeting';

interface HeroEnergy {
  speaking: boolean;
  energy: number;
  burst: number;
}

interface LandingContextValue {
  motionPaused: boolean;
  /** Register a media element's pause function; returns an unregister function. */
  registerMedia: (name: LandingMedia, pause: () => void) => () => void;
  /** Call when a media element starts: every other registered media pauses. */
  claimPlayback: (name: LandingMedia) => void;
  /** Ask the workflow video to resume (used by the hero "Watch how it works" link). */
  playWorkflowVideo: () => void;
  setWorkflowPlayer: (play: (() => void) | null) => void;
  /** Hero canvas state, written by the audio player and read on every animation frame. */
  heroEnergy: MutableRefObject<HeroEnergy>;
}

const LandingContext = createContext<LandingContextValue | null>(null);

export function LandingProvider({ motionPaused, children }: { motionPaused: boolean; children: ReactNode }) {
  const media = useRef(new Map<LandingMedia, () => void>());
  const workflowPlayer = useRef<(() => void) | null>(null);
  const heroEnergy = useRef<HeroEnergy>({ speaking: false, energy: 0, burst: 0 });

  const registerMedia = useCallback((name: LandingMedia, pause: () => void) => {
    media.current.set(name, pause);
    return () => {
      if (media.current.get(name) === pause) media.current.delete(name);
    };
  }, []);

  const claimPlayback = useCallback((name: LandingMedia) => {
    media.current.forEach((pause, other) => {
      if (other !== name) pause();
    });
  }, []);

  const setWorkflowPlayer = useCallback((play: (() => void) | null) => {
    workflowPlayer.current = play;
  }, []);

  const playWorkflowVideo = useCallback(() => workflowPlayer.current?.(), []);

  const value = useMemo(
    () => ({
      motionPaused,
      registerMedia,
      claimPlayback,
      playWorkflowVideo,
      setWorkflowPlayer,
      heroEnergy,
    }),
    [motionPaused, registerMedia, claimPlayback, playWorkflowVideo, setWorkflowPlayer],
  );

  return <LandingContext.Provider value={value}>{children}</LandingContext.Provider>;
}

export function useLanding() {
  const value = useContext(LandingContext);
  if (!value) throw new Error('useLanding must be used inside LandingProvider');
  return value;
}

/** Calls the latest `onHidden` whenever the page becomes hidden. */
export function usePauseWhenHidden(onHidden: () => void) {
  const latest = useRef(onHidden);
  latest.current = onHidden;
  useEffect(() => {
    const handler = () => {
      if (document.hidden) latest.current();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
}

/** Tracks whether an element is in the viewport. `options` are read once. */
export function useInView<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const initialOptions = useRef(options);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      initialOptions.current,
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}
