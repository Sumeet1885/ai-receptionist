import { useCallback, useRef, useState } from 'react';
import { landingAssets } from './assets';
import { HeroCanvas } from './HeroCanvas';
import { HeroListenDock } from './HeroListenDock';

export function HeroSection({ onSpeakingChange }: { onSpeakingChange: (speaking: boolean) => void }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [talking, setTalking] = useState(false);

  const handleSpeaking = useCallback(
    (speaking: boolean) => {
      setTalking(speaking);
      onSpeakingChange(speaking);
    },
    [onSpeakingChange],
  );

  return (
    <section className="hero" id="hero">
      <div className="hero-backdrop" />
      <div className="hero-brand-backdrop" aria-hidden="true">
        <img className="india-culture-art" src={landingAssets.heroIndiaArtwork} alt="" />
        <span lang="hi">बोलेगा</span>
      </div>
      <p className="brand-promise">
        Aapka business. Aapki bhasha. <em>AI ki awaaz.</em>
      </p>
      <div className="cursor-hint">MOVE. TAP. CONNECT.</div>
      <div className="hero-note">
        <small>YOUR BUSINESS, SPEAKING</small>Teach it your business.
        <br />
        <em>Let it find the fit.</em>
      </div>
      <div className="hero-floor" />
      <div className="hero-bottom">
        <div className="hero-kicker">YOUR BUSINESS PERSONA. YOUR NEXT QUALIFIED LEAD.</div>
        <div>
          <h1>
            Your business. Your AI voice.
            <br />
            <em>Your next lead.</em>
          </h1>
          <p className="hero-description">
            Turn your business context and contact list into conversations, qualified leads, and transcripts.
          </p>
          <div className="eyebrow">BOLEGAINDIA.AI / FROM CONTACT LIST TO CUSTOMER CONTEXT</div>
        </div>
      </div>
      <div ref={stageRef} className={`hero-visual duo-stage${talking ? ' talking' : ''}`}>
        <HeroCanvas />
        <div className="conversation-wire wire-left" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="conversation-wire wire-right" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <article className="conversation-person bot-person">
          <div className="person-kicker">YOUR BUSINESS, SPEAKING</div>
          <div className="bot-portrait photo-bot" aria-hidden="true">
            <img src={landingAssets.heroAiAssistant} alt="" width={900} height={675} />
            <span className="portrait-status-dot" />
          </div>
          <h3>Bolega AI</h3>
          <span className="participant-label">Your AI assistant</span>
          <div className="participant-state">
            <i />
            <span id="bot-participant-state">{talking ? 'Voice sample playing' : 'Sample ready'}</span>
          </div>
        </article>
        <HeroListenDock stageRef={stageRef} onSpeakingChange={handleSpeaking} />
        <article className="conversation-person customer-person">
          <div className="person-kicker">A FAMILIAR CONVERSATION</div>
          <div className="customer-portrait" aria-hidden="true">
            <img
              className="customer-group-photo"
              src={landingAssets.heroCustomerGroup}
              alt=""
              width={900}
              height={600}
            />
            <span className="customer-language-tag" id="customer-language-tag">
              Connected
            </span>
          </div>
          <h3>Your customers</h3>
          <span className="participant-label" id="customer-language-label">
            Real people. Real possibilities.
          </span>
          <div className="participant-state">
            <i />
            <span id="customer-participant-state">{talking ? 'Listening preview' : 'Ready to listen'}</span>
          </div>
        </article>
        <div className="duo-disclaimer">Your recorded conversation · Illustrative conversation scene · No live call</div>
      </div>
    </section>
  );
}
