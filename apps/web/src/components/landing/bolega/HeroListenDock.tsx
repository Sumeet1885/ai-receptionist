import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { conversationRecording, landingAssets } from './assets';
import { useLanding, usePauseWhenHidden } from './LandingContext';

const { label, waveform } = conversationRecording;
const BARS = waveform.length;

function clock(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

interface HeroListenDockProps {
  /** The conversation stage; receives the live `--voice-energy` value while the recording plays. */
  stageRef: RefObject<HTMLDivElement | null>;
  onSpeakingChange: (speaking: boolean) => void;
}

/** Central player for the recorded conversation (two takes, one continuous file). */
export function HeroListenDock({ stageRef, onSpeakingChange }: HeroListenDockProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { claimPlayback, registerMedia, playWorkflowVideo, heroEnergy } = useLanding();
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number>(conversationRecording.duration);

  const pause = useCallback(() => audioRef.current?.pause(), []);
  useEffect(() => registerMedia('hero-audio', pause), [registerMedia, pause]);
  usePauseWhenHidden(pause);

  useEffect(() => {
    onSpeakingChange(playing);
    heroEnergy.current.speaking = playing;
    if (!playing) {
      heroEnergy.current.energy = 0;
      stageRef.current?.style.setProperty('--voice-energy', '0');
      return;
    }
    // While playing, follow the audio clock every frame for a smooth waveform and sphere.
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
        const fraction = total ? audio.currentTime / total : 0;
        const energy = waveform[Math.min(BARS - 1, Math.floor(fraction * BARS))];
        heroEnergy.current.energy = energy;
        stageRef.current?.style.setProperty('--voice-energy', String(energy));
        setCurrent(audio.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration, heroEnergy, onSpeakingChange, stageRef]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlaying = () => {
      setPlaying(true);
      setEnded(false);
      setBusy(false);
      setBuffering(false);
      setError(null);
      claimPlayback('hero-audio');
    };
    const onPause = () => {
      setPlaying(false);
      setBuffering(false);
      setCurrent(audio.currentTime);
    };
    const onEnded = () => {
      setPlaying(false);
      setEnded(true);
      setCurrent(audio.currentTime);
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onTime = () => setCurrent(audio.currentTime);
    const onWaiting = () => setBuffering(!audio.paused);
    const onError = () => {
      setBusy(false);
      setPlaying(false);
      setError('This recording could not load. Please try again.');
    };
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', onError);
      audio.pause();
    };
  }, [claimPlayback]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || busy) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
    } catch {
      // Autoplay policies or a missing file: let the visitor retry.
      setBusy(false);
      setError('Playback could not start. Press play to try again.');
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrent(value);
    setEnded(false);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };

  const status = error
    ? error
    : busy
      ? `Loading ${label} recording…`
      : buffering
        ? `Buffering ${label} recording…`
        : playing
          ? `Playing ${label} · Recorded voice sample`
          : ended
            ? `${label} sample complete · Play again`
            : `Recorded ${label} sample · ${current > 0 ? 'Paused' : 'Press play to listen'}`;

  const fraction = duration ? current / duration : 0;

  return (
    <div className={`hero-action hero-cta-bottom hero-listen-dock${playing ? ' is-playing' : ''}`}>
      <div className="listen-top">
        <div>
          <span className="listen-eyebrow">TWO RECORDINGS. ONE CONTINUOUS LISTEN.</span>
          <strong>Hear a conversation.</strong>
        </div>
      </div>
      <div className="listen-playback">
        <button
          id="voice-play"
          className="voice-play"
          type="button"
          onClick={togglePlay}
          disabled={busy}
          aria-label={`${playing ? 'Pause' : 'Play'} ${label} recording`}
        >
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <div className="voice-wave-wrap">
          <svg id="voice-wave" viewBox="0 0 512 48" preserveAspectRatio="none" aria-hidden="true">
            {waveform.map((v, i) => {
              const barHeight = 4 + v * 40;
              return (
                <rect
                  key={i}
                  x={i * 8 + 1}
                  y={(48 - barHeight) / 2}
                  width={4}
                  height={barHeight}
                  rx={2}
                  style={{ fill: i / BARS < fraction ? 'var(--color-primary)' : '#cbd8bb' }}
                />
              );
            })}
          </svg>
          <input
            id="voice-seek"
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={Math.min(current, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label={`Seek through ${label} recording`}
            aria-valuetext={`${clock(current)} of ${clock(Math.round(duration))}`}
          />
        </div>
        <span id="voice-time" className="voice-time">
          {clock(current)} / {clock(Math.round(duration))}
        </span>
        <button
          id="voice-mute"
          className="voice-mute"
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute recording' : 'Mute recording'}
        >
          {muted ? '×' : '♫'}
        </button>
      </div>
      <div className="listen-bottom">
        <span id="voice-status" role="status">
          {status}
        </span>
        <a href="#workflow" onClick={() => playWorkflowVideo()}>
          Watch how it works ↗
        </a>
      </div>
      <audio ref={audioRef} id="hero-recording" src={landingAssets.conversationAudio} preload="metadata" />
    </div>
  );
}
