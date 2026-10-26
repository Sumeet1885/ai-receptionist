import { Fragment } from 'react';
import { Reveal } from './Reveal';

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

const tickerItems = ['Your business persona.', 'Your contact list.', 'Calls on your schedule.', 'Leads. With transcripts.'];

export function Ticker() {
  return (
    <div className="ticker" aria-hidden="true">
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

export function BrandValueSection() {
  return (
    <section className="meaning-section brand-value-section" id="product-persona">
      <Reveal className="meaning-heading">
        <div>
          <span className="eyebrow">04 / MORE THAN A CALL</span>
          <h2>
            A familiar voice.
            <br />
            <em>A stronger first impression.</em>
          </h2>
        </div>
        <p>
          Your customers should recognise your business
          <br />
          in the way a conversation feels.
        </p>
      </Reveal>
      <div className="brand-value-grid">
        <Reveal as="article" className="brand-value-card">
          <div className="brand-value-art voice-signature" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="voice-line" />
            ))}
            <i>Your business, speaking.</i>
          </div>
          <span className="eyebrow">FAMILIARITY</span>
          <h3>A voice with your identity.</h3>
          <p>Your language and tone give the conversation a consistent sense of who you are.</p>
        </Reveal>
        <Reveal as="article" className="brand-value-card">
          <div className="brand-value-art attention-art" aria-hidden="true">
            <div className="attention-circle">
              <span>?</span>
            </div>
            <i>A little understanding.</i>
          </div>
          <span className="eyebrow">RELEVANCE</span>
          <h3>Questions with a reason.</h3>
          <p>Keep the conversation focused on what the customer needs and what your business can offer.</p>
        </Reveal>
        <Reveal as="article" className="brand-value-card">
          <div className="brand-value-art clarity-art" aria-hidden="true">
            <span className="clarity-line faded" />
            <span className="clarity-line faded" />
            <span className="clarity-focus">
              A clear next step <b>↗</b>
            </span>
            <i>A useful place to begin.</i>
          </div>
          <span className="eyebrow">PURPOSE</span>
          <h3>More than a polite hello.</h3>
          <p>Give your team a meaningful reason to continue the conversation.</p>
        </Reveal>
      </div>
      <div className="meaning-bottom">
        <span>Familiarity. Relevance. Purpose.</span>
        <a href="#use-cases">Find your kind of conversation ↗</a>
      </div>
    </section>
  );
}

export function ContrastSection() {
  return (
    <section className="value-contrast-section" id="how-system">
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
        <Reveal className="contrast-stage">
          <article className="before-context">
            <span className="eyebrow">A CONTACT ON ITS OWN</span>
            <div className="before-avatar" aria-hidden="true">
              ?
            </div>
            <strong>A name. A number.</strong>
            <div className="unclear-lines">
              <span>What do they need?</span>
              <span>What matters to them?</span>
              <span>Where should we start?</span>
            </div>
            <small>Questions your team still needs to answer.</small>
          </article>
          <div className="contrast-bridge" aria-hidden="true">
            <span>✦</span>
            <i />
            <i />
            <i />
          </div>
          <article className="after-context">
            <div className="context-head">
              <span className="eyebrow">A CUSTOMER WITH CONTEXT</span>
              <span className="context-signal">A useful starting point</span>
            </div>
            <div className="context-insight">
              <span>NEED</span>
              <strong>What the customer is looking for.</strong>
            </div>
            <div className="context-insight">
              <span>PRIORITY</span>
              <strong>What will help them decide.</strong>
            </div>
            <div className="context-insight">
              <span>INTENT</span>
              <strong>How they want to move forward.</strong>
            </div>
            <div className="context-foot">Your team follows up with something to say.</div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}

const industries = [
  {
    eyebrow: 'EDUCATION',
    title: 'Find the next learner.',
    text: 'Understand course interest, goals, and preferred enrolment timelines.',
    outcome: 'Interest → Counselling follow-up',
    artClass: 'education-art',
    art: (
      <div className="book-sheet">
        ✦<i />
        <i />
        <i />
      </div>
    ),
    float: 'Course interest ↗',
  },
  {
    eyebrow: 'BUSINESS SERVICES',
    title: 'Understand the brief.',
    text: 'Ask about the business need, scope, priorities, and budget.',
    outcome: 'Requirement → Team discussion',
    artClass: 'services-art',
    art: <div className="service-cog">✳</div>,
    float: 'A need understood ✓',
  },
  {
    eyebrow: 'RETAIL & COMMERCE',
    title: 'Know what they’re looking for.',
    text: 'Discover product interest, preferences, and purchase intent.',
    outcome: 'Preference → Sales follow-up',
    artClass: 'retail-art',
    art: (
      <div className="shopping-bag">
        <span />✦
      </div>
    ),
    float: 'Product enquiry ↗',
  },
  {
    eyebrow: 'REAL ESTATE',
    title: 'Find the right fit.',
    text: 'Understand location, budget, configuration, and interest in a visit.',
    outcome: 'Buyer need → Property discussion',
    artClass: 'property-art',
    art: (
      <div className="house-shape">
        <i />
        <i />
      </div>
    ),
    float: 'Visit interest ✓',
  },
];

export function UseCasesSection() {
  return (
    <section className="usecase-section" id="use-cases">
      <div className="meaning-section">
        <Reveal className="meaning-heading">
          <div>
            <span className="eyebrow">07 / DIFFERENT BUSINESSES. FAMILIAR NEEDS.</span>
            <h2>
              Your industry.
              <br />
              <em>Your kind of conversation.</em>
            </h2>
          </div>
          <p>
            Start with the questions your business needs answered.
            <br />
            These are examples of how a persona can be shaped.
          </p>
        </Reveal>
        <div className="industry-grid">
          {industries.map((industry) => (
            <Reveal as="article" key={industry.eyebrow} className="industry-card">
              <div className={`industry-art ${industry.artClass}`} aria-hidden="true">
                {industry.art}
                <span className="industry-float">{industry.float}</span>
              </div>
              <span className="eyebrow">{industry.eyebrow}</span>
              <h3>{industry.title}</h3>
              <p>{industry.text}</p>
              <div className="industry-outcome">{industry.outcome}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
