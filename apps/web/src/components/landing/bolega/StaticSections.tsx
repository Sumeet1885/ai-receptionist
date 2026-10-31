import { Fragment } from 'react';
import { Reveal } from './Reveal';
import { sectionTexture } from './sectionTextures';
import { ReceptionistPortrait } from './ProductVisuals';
import { IndustryExplorer } from './IndustryExplorer';
import { ConversationReels } from './ConversationReels';

/** Decorative floating stickers. `aria-hidden` and `pointer-events: none` (in landing.css) keep them out of the way. */
export function AmbientStickers() {
  return (
    <div className="ambient-stickers" aria-hidden="true">
      <span className="ambient-sticker sticker-hello" lang="hi">
        नमस्ते <i>✦</i>
      </span>
      <span className="ambient-sticker sticker-wave">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      <span className="ambient-sticker sticker-bubble">
        hello<span>↗</span>
      </span>
      <span className="ambient-sticker sticker-spark">✳</span>
      <span className="ambient-sticker sticker-note">
        Made for
        <br />
        <b>many hellos.</b>
      </span>
    </div>
  );
}

const tickerItems = ['Your business persona.', 'Your contact list.', 'Start your campaign.', 'Leads. With transcripts.'];

export function Ticker() {
  return (
    <div style={sectionTexture('ticker')} className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {[...tickerItems, ...tickerItems].map((item, i) => (
          <Fragment key={i}>
            <b>{item}</b>
            <i>✳</i>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const brandValues = [
  {
    name: 'Familiarity', image: 'familiarity', title: 'A voice with your identity.',
    text: 'Your language and tone give the conversation a consistent sense of who you are.',
    alt: 'Indian boutique owner smiling during a phone conversation in her shop',
  },
  {
    name: 'Relevance', image: 'relevance', title: 'Questions with a reason.',
    text: 'Keep the conversation focused on what the customer needs and what your business can offer.',
    alt: 'Business consultant listening to a customer on the phone while taking notes',
  },
  {
    name: 'Purpose', image: 'purpose', title: 'More than a polite hello.',
    text: 'Give your team a meaningful reason to continue the conversation.',
    alt: 'Two business colleagues reviewing customer follow-up notes together on a laptop',
  },
];

export function BrandValueSection() {
  return (
    <section style={sectionTexture('brand')} className="meaning-section brand-value-section" id="product-persona">
      <Reveal className="meaning-heading">
        <div>
          <span className="eyebrow">02 / MORE THAN A CALL</span>
          <h2>
            A familiar voice.{' '}
            <em>A stronger first impression.</em>
          </h2>
        </div>
        <p>
          Your customers should recognise your business
          <br />
          in the way a conversation feels.
        </p>
      </Reveal>
      <p className="brand-gallery-hint">Swipe to explore the three stories →</p>
      <div className="brand-photo-gallery" role="region" aria-label="Familiarity, relevance and purpose stories" tabIndex={0}>
        {brandValues.map(({ name, image, title, text, alt }, index) => (
          <Reveal as="figure" className="brand-photo-story" key={name}>
            <div className="brand-photo-media">
              <img src={`/bolegaindia/images/brand-${image}.webp`}
                srcSet={`/bolegaindia/images/brand-${image}-480.webp 480w, /bolegaindia/images/brand-${image}.webp 960w`}
                sizes="(max-width: 700px) 88vw, (max-width: 1400px) 29vw, 390px"
                width="960" height="1200" loading="lazy" decoding="async" alt={alt} />
              <span className="brand-photo-number" aria-hidden="true">0{index + 1}</span>
            </div>
            <figcaption>
              <span className="eyebrow">{name}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </figcaption>
          </Reveal>
        ))}
      </div>
      <div className="meaning-bottom">
        <span>Familiarity. Relevance. Purpose.</span>
        <a href="#use-cases">Find your kind of conversation ↗</a>
      </div>
    </section>
  );
}

export function BusinessPersonaSection() {
  return (
    <section style={sectionTexture('contrast')} className="value-contrast-section" id="business-persona">
      <div className="context-cinema">
        <div className="context-cinema-copy">
          <span className="eyebrow">03 / BUILT AROUND YOUR BUSINESS</span>
          <h2>A human touch.<br /><em>A head start for your team.</em></h2>
          <p>Your offering. Your language. Your questions. An AI persona that brings them together in every conversation.</p>
          <a className="btn" href="#workflow">See how your persona works <span aria-hidden="true">↗</span></a>
          <div className="cinema-tags"><span>Business context</span><span>Familiar language</span><span>Clear next steps</span></div>
        </div>
        <div className="context-cinema-image">
          <ReceptionistPortrait variant="business" />
          <span className="cinema-image-label">A familiar voice. A meaningful hello.</span>
        </div>
      </div>
    </section>
  );
}

export function ContrastSection() {
  return (
    <section style={sectionTexture('contrast')} className="value-contrast-section" id="how-system">
      <div className="meaning-section">
        <Reveal className="meaning-heading">
          <div>
            <span className="eyebrow">05 / CONTEXT CHANGES THE FOLLOW-UP</span>
            <h2>
              Less guesswork.
              <br />
              <em>More to work with.</em>
            </h2>
          </div>
          <p>
            A contact tells you who to call.
            <br />A conversation helps you understand why.
          </p>
        </Reveal>
        <ConversationReels />
      </div>
    </section>
  );
}

export function UseCasesSection() {
  return (
    <section style={sectionTexture('usecases')} className="usecase-section" id="use-cases">
      <div className="meaning-section">
        <Reveal className="meaning-heading">
          <div>
            <span className="eyebrow">07 / DIFFERENT BUSINESSES. FAMILIAR NEEDS.</span>
            <h2>
              Your industry.{' '}
              <em>Your kind of conversation.</em>
            </h2>
          </div>
          <p>
            Start with the questions your business needs answered.
            <br />
            These are examples of how a persona can be shaped.
          </p>
        </Reveal>
        <IndustryExplorer />
      </div>
    </section>
  );
}
