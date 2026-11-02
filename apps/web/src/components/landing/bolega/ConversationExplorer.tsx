import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Headphones, Pause, Play } from 'lucide-react';
import { landingAssets } from './assets';
import { useInView, useLanding, usePauseWhenHidden } from './LandingContext';

const moments = [
  {
    name: 'The need', label: 'STAY REQUIREMENT', title: 'A family getaway, with room for Max.',
    question: 'A two-bedroom private-pool villa, from the 12th to the 14th?',
    answer: 'We would like a private-pool villa, and we are bringing our Golden Retriever.',
    insight: 'Two bedrooms · Private pool · Pet-friendly stay',
    next: 'Confirm travel dates, guests, villa availability, and the pet policy.',
    start: 6.48, end: 30.64,
    image: 'need', alt: 'A young Indian business founder on a phone call, with his growing team working behind him',
  },
  {
    name: 'The priorities', label: 'FAMILY PREFERENCES', title: 'The details make the stay feel right.',
    question: 'What about the pet fee and Jain food for the family?',
    answer: 'Is Max’s entry fee included? Can you prepare Jain food for my parents?',
    insight: 'Jain meals · Pet charges · Family comfort',
    next: 'Verify dietary needs and clearly explain all fees before confirming the stay.',
    start: 46.24, end: 64.16,
    image: 'priorities', alt: 'An Indian business owner considering options and taking notes during a customer conversation',
  },
  {
    name: 'The next step', label: 'BOOKING INTENT', title: 'An agreed next step, with context.',
    question: 'Shall I share the UPI payment link on WhatsApp?',
    answer: 'Perfect. Please send the payment link.',
    insight: 'Payment-link request · Booking confirmation pending payment',
    next: 'Verify payment and booking details. The offer in this sample is illustrative.',
    start: 75.04, end: 104.24,
    image: 'follow-up', alt: 'An Indian founder smiling during a follow-up call by his office window',
  },
];

/** Explore moments from the same supplied recording used in the hero and film. */
export function ConversationExplorer() {
  const [ref, visible] = useInView<HTMLDivElement>();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const { claimPlayback, registerMedia } = useLanding();
  const moment = moments[selected];
  const { start, end } = moment;
  const clipDuration = end - start;

  useEffect(() => registerMedia('context-audio', () => audio.current?.pause()), [registerMedia]);
  useEffect(() => { if (!visible) audio.current?.pause(); }, [visible]);
  usePauseWhenHidden(() => audio.current?.pause());

  const selectMoment = (index: number) => {
    audio.current?.pause();
    setSelected(index);
    setProgress(0);
    setError(false);
  };

  const toggleAudio = () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    setError(false);
    if (element.currentTime < start || element.currentTime >= end - 0.05 || progress === 0) element.currentTime = start;
    element.play().catch(() => setError(true));
  };

  return (
    <div ref={ref} className="conversation-explorer">
      <div className="conversation-explorer-heading">
        <div><span className="eyebrow">THE CONVERSATION CONTINUES</span><h3>Follow the words. <em>Find the opportunity.</em></h3></div>
        <p>Select a moment. Hear the conversation.<br />See what your team can take forward.</p>
      </div>
      <div className="conversation-moments" role="group" aria-label="Choose a conversation moment">
        {moments.map(({ name }, index) => (
          <button key={name} type="button" aria-pressed={selected === index} aria-controls="conversation-moment"
            onClick={() => selectMoment(index)}>
            <span className="moment-number">0{index + 1}</span><span>{name}</span><ArrowRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div id="conversation-moment" className="conversation-moment" aria-label={moment.name} role="region">
        <figure className="moment-photo-story">
          <img className="moment-story-image" src={`/bolegaindia/images/conversation-${moment.image}.webp`}
            srcSet={`/bolegaindia/images/conversation-${moment.image}-600.webp 600w, /bolegaindia/images/conversation-${moment.image}.webp 1200w`}
            sizes="(max-width: 700px) 825px, (max-width: 1400px) 810px, 900px"
            width="1200" height="800" loading="lazy" decoding="async" alt={moment.alt} />
          <div className="moment-photo-shade" aria-hidden="true" />
          <div className="moment-meta"><span className="eyebrow">RAHUL & PRIYA / RESORT ENQUIRY</span><Headphones size={20} aria-hidden="true" /></div>
          <figcaption className="moment-photo-caption">
          <span className="moment-speaker">ENGLISH SUMMARY · ORIGINAL VOICES BELOW</span>
          <p className="moment-question">{moment.question}</p>
          <blockquote><p>“{moment.answer}”</p><cite>Customer</cite></blockquote>
          <div className="moment-playback">
            <button type="button" className="moment-listen" onClick={toggleAudio} aria-label={playing ? 'Pause this moment' : 'Hear this moment'}>
              {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              {playing ? 'Pause this moment' : 'Hear this moment'}
            </button>
            <span className="moment-duration">{Math.round(clipDuration)} sec · Supplied recording</span>
          </div>
          <div className="moment-progress" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>
          {error && <p role="status" className="moment-error">Could not play this clip. Try the full video above.</p>}
          </figcaption>
        </figure>
        <div className="moment-insight">
          <span className="eyebrow">CONTEXT YOUR TEAM CAN USE</span>
          <h4>{moment.title}</h4>
          <div className="moment-captured"><span>{moment.label}</span><strong>{moment.insight}</strong></div>
          <div className="moment-next"><span>SUGGESTED FOLLOW-UP</span><p>{moment.next}</p></div>
          <button type="button" className="moment-next-button" onClick={() => selectMoment((selected + 1) % moments.length)}>
            {selected === 2 ? 'Explore from the beginning' : 'Explore the next moment'}<ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <span className="industry-status" role="status">Selected {moment.name.toLowerCase()}: {moment.insight}.</span>
      <p className="conversation-example-note">Same recording as the hero · Hindi, Punjabi & Marathi · English summaries · Illustrative booking scenario</p>
      <audio ref={audio} src={landingAssets.customerConversationVoice} preload="none"
        onPlay={() => { setPlaying(true); claimPlayback('context-audio'); }} onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setError(true); }}
        onTimeUpdate={() => {
          const element = audio.current;
          if (!element) return;
          setProgress(Math.max(0, Math.min(1, (element.currentTime - start) / clipDuration)));
          if (element.currentTime >= end - 0.05) element.pause();
        }} />
    </div>
  );
}
