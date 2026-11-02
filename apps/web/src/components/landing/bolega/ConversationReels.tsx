import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, Volume2 } from 'lucide-react';
import reelData from './conversationReels.json';
import multilingual from './multilingualConversation.json';
import wedding from './weddingConversation.json';
import { useInView, useLanding, usePauseWhenHidden } from './LandingContext';

const visuals: Record<string, { src: string; alt: string }> = {
  education: { src: '/bolegaindia/images/reel-education.webp', alt: 'A learner taking a course enquiry call at her study desk' },
  property: { src: '/bolegaindia/images/reel-property.webp', alt: 'A prospective buyer discussing a home near an apartment window' },
  services: { src: '/bolegaindia/images/reel-services.webp', alt: 'A home-decor entrepreneur discussing her website needs over the phone' },
};

interface DialogueLine { speaker: string; text: string; start: number; end: number; lang?: string; language?: string; translation?: string; moment?: string }
interface VoiceStory { id: string; topic: string; title: string; agentGender: string; customerGender: string; outcome: string; languages: string; duration: number; lines: DialogueLine[]; chapters?: { id: string; label: string; start: number }[] }
const stories: VoiceStory[] = [wedding, ...reelData, multilingual];
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Local voice reels with timed native-language dialogue and coordinated playback. */
export function ConversationReels() {
  const [ref, visible] = useInView<HTMLDivElement>();
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false);
  const [time, setTime] = useState(0);
  const [error, setError] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showWeddingCaptions, setShowWeddingCaptions] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const { registerMedia, claimPlayback } = useLanding();
  const reel = stories[selected];
  const line = reel.lines.find(line => time >= line.start && time < line.end) || (time >= reel.duration ? reel.lines[reel.lines.length - 1] : reel.lines[0]);
  const image = visuals[reel.id];
  const acrossIndia = reel.id === 'across-india';
  const weddingStory = reel.id === 'wedding';
  const reportPlaybackError = useCallback((reason: unknown) => {
    // Intentional stops and story changes can cancel a pending play request.
    if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
  }, []);

  useEffect(() => registerMedia('conversation-reel', () => audio.current?.pause()), [registerMedia]);
  useEffect(() => { if (!visible) audio.current?.pause(); }, [visible]);
  usePauseWhenHidden(() => audio.current?.pause());

  // Auto-play whenever an enquiry is selected
  useEffect(() => {
    if (!shouldPlay) return;
    const el = audio.current;
    if (!el) return;
    claimPlayback('conversation-reel');
    el.currentTime = 0;
    el.play().catch(reportPlaybackError);
  }, [selected, shouldPlay, claimPlayback, reportPlaybackError]);

  const choose = (index: number) => {
    if (selected === index) {
      toggle();
      return;
    }
    audio.current?.pause();
    setSelected(index);
    setTime(0);
    setError(false);
    setShouldPlay(true);
  };

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      element.currentTime = 0;
      setTime(0);
      setPlaying(false);
      setShouldPlay(false);
      return;
    }
    setError(false);
    setShouldPlay(true);
    claimPlayback('conversation-reel');
    element.play().catch(reportPlaybackError);
  };

  const jumpToLanguage = (start: number) => {
    // Decoders round seek positions to sample boundaries; land just inside the new exchange.
    const position = Math.min(start + 0.03, reel.duration);
    if (audio.current) audio.current.currentTime = position;
    setTime(position);
  };

  return (
    <div className="conversation-reels" ref={ref}>
      <div className="reel-intro">
        <span className="eyebrow">DIFFERENT VOICES · REAL CONVERSATION FLOW</span>
        <p>Explore a quick enquiry, hear nine Indian languages, or join Paras and Punam’s wedding plans.</p>
      </div>
      <div className="reel-layout">
        <div className="reel-choices" role="group" aria-label="Choose a conversation reel">
          {stories.map((item, index) => {
            const isCurrent = selected === index;
            return (
              <button key={item.id} type="button" aria-pressed={isCurrent} aria-controls="reel-stage" onClick={() => choose(index)}>
                <span className="reel-choice-number">0{index + 1}</span>
                <span><strong>{item.topic}</strong><small>{item.id === 'wedding' ? 'Marathi, Hindi & English' : item.id === 'across-india' ? '9 languages · Continuous conversation' : `${item.agentGender} AI · ${item.customerGender.toLowerCase()} customer`}</small></span>
                {isCurrent && playing ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <figure id="reel-stage" className={`reel-stage${playing ? ' is-playing' : ''}${acrossIndia ? ' reel-stage-india' : ''}${weddingStory ? ' reel-stage-wedding' : ''}`} aria-label={reel.title}>
          {image && <img key={image.src} src={image.src} alt={image.alt} width="540" height="960" loading="lazy" decoding="async" />}
          <div className="reel-shade" aria-hidden="true" />
          {!weddingStory && <div className="reel-stage-top"><span>BOLEGAINDIA.AI / {acrossIndia ? 'ACROSS INDIA' : 'VOICE STORIES'}</span><Volume2 size={19} aria-hidden="true" /></div>}
          {acrossIndia && <div className="reel-language-rail" role="group" aria-label="Jump to a language">{reel.lines.filter(item => item.speaker === 'Customer').map(item => <button type="button" key={item.lang} aria-pressed={line.lang === item.lang} onClick={() => jumpToLanguage(item.start)}>{item.language}</button>)}</div>}
          {weddingStory &&
            <div className="wedding-couple-visual">
              <img src="/bolegaindia/images/wedding-couple.webp" srcSet="/bolegaindia/images/wedding-couple-480.webp 480w, /bolegaindia/images/wedding-couple.webp 960w" sizes="(max-width: 700px) 90vw, (max-width: 1100px) 52vw, 760px" width="960" height="640" loading="lazy" decoding="async" alt="Illustration of an engaged Indian couple planning their wedding together on a speakerphone call" />
              <span className="wedding-couple-caption">Paras &amp; Punam</span>
              <span className="wedding-sound-wave" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ height: `${8 + (i * 7 % 19)}px`, animationDelay: `${i * 0.09}s` }} />)}</span>
            </div>
          }
          <figcaption>
            {!weddingStory && <><span className="eyebrow">{acrossIndia ? `${line.language} / CUSTOMER ↔ AI` : reel.topic}</span><h4>{reel.title}</h4></>}
            <div className="reel-caption" id="reel-live-caption" hidden={weddingStory && !showWeddingCaptions}>{!weddingStory && <span>{line.speaker === 'Agent' ? `AI ASSISTANT · ${reel.agentGender.toUpperCase()}` : 'CUSTOMER'}</span>}<p lang={line.lang || 'hi'} dir={line.lang === 'ur' ? 'rtl' : undefined}>{line.text}</p>{weddingStory && <button className="wedding-translation-toggle" type="button" aria-pressed={showTranslation} onClick={() => setShowTranslation(value => !value)}>{showTranslation ? 'Hide English summary' : 'Show English summary'}</button>}{line.translation && (!weddingStory || showTranslation) && <small>{line.translation}</small>}</div>
            <div className="reel-controls">
            <button type="button" onClick={toggle} className="reel-play" aria-label={playing ? 'Stop conversation' : 'Hear the conversation'}>
              {playing ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              {playing ? 'Stop conversation' : 'Hear the conversation'}
            </button>
            {weddingStory && <button type="button" className="wedding-caption-toggle" aria-expanded={showWeddingCaptions} aria-controls="reel-live-caption" onClick={() => setShowWeddingCaptions(value => !value)}>{showWeddingCaptions ? 'Hide captions' : 'Captions'}</button>}
            </div>
            <input type="range" min="0" max={reel.duration} step="0.1" value={Math.min(time, reel.duration)} aria-label="Seek conversation reel" onChange={event => { if (audio.current) audio.current.currentTime = Number(event.target.value); setTime(Number(event.target.value)); }} />
            <div className="reel-time"><span>{clock(time)} / {clock(reel.duration)}</span>{!weddingStory && <span>{acrossIndia ? '9 languages · One conversation' : reel.languages}</span>}</div>
            {error && <p role="status">Playback could not start. Please try again.</p>}
          </figcaption>
        </figure>
      </div>
      <details className="reel-transcript" key={`transcript-${reel.id}`}><summary>{weddingStory ? 'Read Paras & Punam’s wedding conversation' : acrossIndia ? 'Read the nine-language conversation' : `Read the ${reel.topic.toLowerCase()} conversation`}</summary><ol>{reel.lines.map((item, index) => <li key={index}><strong>{item.language ? `${item.language} · ` : ''}{item.speaker === 'Agent' ? weddingStory ? 'AI event manager' : 'AI assistant' : weddingStory ? item.speaker : 'Customer'}</strong><p lang={item.lang || 'hi'} dir={item.lang === 'ur' ? 'rtl' : undefined}>{item.text}</p>{item.translation && <p>{item.translation}</p>}</li>)}</ol></details>
      <audio ref={audio} key={`audio-${reel.id}`} src={`/bolegaindia/audio/reels/${reel.id}.mp3`} preload="none" onPlay={() => { setPlaying(true); setError(false); claimPlayback('conversation-reel'); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setShouldPlay(false); setTime(0); }} onError={() => { setError(true); setPlaying(false); setShouldPlay(false); }} onTimeUpdate={() => setTime(audio.current?.currentTime || 0)} />
    </div>
  );
}

