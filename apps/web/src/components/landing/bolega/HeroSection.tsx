import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { SUPPORTED_LANGUAGES } from '@ai-receptionist/contracts';
import { landingAssets } from './assets';
import { HeroListenDock } from './HeroListenDock';
import { sectionTexture } from './sectionTextures';
import { useLanding } from './LandingContext';
import './hero-scene.css';

export function HeroSection({ onSpeakingChange }: { onSpeakingChange: (speaking: boolean) => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const requestSerial = useRef(0);
  const [talking, setTalking] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const { motionPaused, registerMedia, claimPlayback } = useLanding();

  const handleSpeaking = useCallback((speaking: boolean) => {
    setTalking(speaking);
    onSpeakingChange(speaking);
  }, [onSpeakingChange]);

  const pauseGreeting = useCallback(() => {
    if (audio.current) {
      audio.current.pause();
      setSpeaking(null);
    }
  }, []);

  useEffect(() => {
    return registerMedia('language-greeting', pauseGreeting);
  }, [registerMedia, pauseGreeting]);

  const greet = (e: MouseEvent<HTMLButtonElement>, shown: string, name: string, lang: string) => {
    const element = audio.current;
    if (element) {
      const request = ++requestSerial.current;
      element.pause();
      element.dataset.language = lang;
      element.src = `/bolegaindia/audio/greetings/${lang}.mp3`;
      claimPlayback('language-greeting');
      element.play().catch((reason: unknown) => {
        if (request !== requestSerial.current || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setSpeaking(null);
      });
      setSpeaking(lang);
    }
    if (!motionPaused) {
      e.currentTarget.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.1) rotate(-3deg)' }, { transform: 'scale(1)' }],
        { duration: 400 },
      );
    }
  };

  return (
    <section style={sectionTexture('hero')} className="hero hero-wide" id="hero">
      <div className="hero-wide-heading">
        <div className="hero-india-wordmark" aria-label="India Bolega">
          <img src={landingAssets.heroIndiaArtwork} alt="India" width="620" height="240" />
          <strong lang="hi">बोलेगा</strong>
        </div>
        <h1 className="hero-main-title">
          <span>Your business. Your AI voice.</span>
          <span className="hero-tap-callout" aria-hidden="true">
            <span className="callout-pill">
              <i className="callout-dot">●</i>
              Tap to play
            </span>
            <svg className="callout-arrow" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
              <path d="M4 6C18 6 30 16 30 34M30 34L20 25M30 34L38 25" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </h1>
        <div style={sectionTexture('languages')} className="hero-language-wall" aria-label="Supported languages">
          <div className="language-belt">
            {[...SUPPORTED_LANGUAGES, ...SUPPORTED_LANGUAGES].map((l, i) => {
              const isSpeaking = speaking === l.code;
              return (
                <button
                  key={`${l.code}-${i}`}
                  type="button"
                  className={`word-pill${isSpeaking ? ' is-playing' : ''}`}
                  lang={l.code}
                  aria-label={`Hear ${l.name} greeting: ${l.greeting} (${l.romanised})`}
                  aria-pressed={isSpeaking}
                  onClick={(e) => greet(e, l.greeting, l.name, l.code)}
                >
                  <span className="pill-greeting">{l.greeting}</span>
                  {isSpeaking && (
                    <span className="pill-equalizer" aria-hidden="true">
                      <i /><i /><i />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <p className="hero-hindi-promise" lang="hi-Latn">
          <strong>Aapka business.</strong> <strong>Aapki bhasha.</strong> <strong>AI ki awaaz.</strong>
        </p>
      </div>
      <audio
        ref={audio}
        preload="none"
        onEnded={() => setSpeaking(null)}
        onPause={() => setSpeaking(null)}
        onError={() => setSpeaking(null)}
      />
      <div ref={stageRef} className={`hero-wide-scene${talking ? ' is-speaking' : ''}`}>
        <div className="hero-voice-bridge" aria-hidden="true">
          {Array.from({ length: 45 }, (_, i) => (
            <i key={i} style={{ height: `${8 + ((i * 13) % 37)}px`, animationDelay: `${i * -0.07}s` }} />
          ))}
        </div>
        <figure className="hero-wide-person hero-wide-ai">
          <div className="hero-wide-portrait">
            <img
              src={landingAssets.heroAiAssistant}
              alt="Illustration of a male AI receptionist wearing a headset"
              width="800"
              height="800"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <figcaption>
            Bolega AI <span>Your business, speaking.</span>
          </figcaption>
        </figure>
        <div className="hero-wide-player">
          <HeroListenDock stageRef={stageRef} onSpeakingChange={handleSpeaking} />
        </div>
        <figure className="hero-wide-person hero-wide-customers">
          <div className="hero-wide-portrait">
            <img
              src={landingAssets.heroCustomerGroup}
              alt="A group of Indian customers"
              width="900"
              height="600"
              decoding="async"
            />
          </div>
          <figcaption>
            Your customers <span>A familiar conversation.</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
