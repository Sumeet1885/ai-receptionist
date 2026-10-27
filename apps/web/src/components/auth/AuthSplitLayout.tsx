import React from 'react';

const ASSISTANT_PORTRAIT = '/bolegaindia/images/hero-ai-human-assistant.webp';
const BRAND_WEAVE = '/bolegaindia/images/bolegaindia-brand-weave.svg';

const POINTS = [
  'Answers in your customers’ language',
  'Captures and qualifies every lead',
  'Books appointments on your calendar',
];

// Decorative bars echoing the landing page's conversation waveform.
const WAVE = [0.35, 0.7, 0.5, 0.9, 0.6, 1, 0.45, 0.8, 0.55, 0.95, 0.4, 0.75, 0.5, 0.85, 0.3];

/**
 * Sign-in and access-request layout: brand art on the left (desktop only), form on the right.
 * On large screens it fills the space under the header exactly, so the page never scrolls;
 * only the form column can scroll, and only on unusually short screens.
 */
export function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-hidden="true"
        className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-text px-10 py-9 text-primary-foreground lg:flex xl:px-14 xl:py-11"
      >
        <img src={BRAND_WEAVE} alt="" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 opacity-[0.07]" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-accent-lime/20 blur-[110px]" />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-lime">bolegaindia.ai</p>
          <p className="mt-4 max-w-md font-display text-[clamp(1.75rem,2.6vw,2.6rem)] font-semibold leading-[1.08] tracking-[-0.04em]">
            Aapka business. Aapki bhasha.{' '}
            <em className="font-accent font-normal italic text-accent-lime">AI ki awaaz.</em>
          </p>
        </div>

        <div className="relative my-6 flex min-h-0 items-center gap-5">
          <img
            src={ASSISTANT_PORTRAIT}
            alt=""
            width={800}
            height={800}
            className="h-[clamp(9rem,22vh,13rem)] w-[clamp(9rem,22vh,13rem)] shrink-0 rounded-[28px] object-cover object-[center_30%] shadow-2xl ring-1 ring-white/15"
          />
          <div className="min-w-0 space-y-2.5 text-sm">
            <div className="w-fit max-w-[16rem] rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5 leading-snug">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/60">Caller</span>
              Kal shaam 5 baje appointment mil sakta hai?
            </div>
            <div className="ml-6 w-fit max-w-[16rem] rounded-2xl rounded-br-md bg-accent-lime px-3.5 py-2.5 leading-snug text-text">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-text/60">Bolega AI</span>
              Haan ji, 5 baje ka slot available hai. Aapka naam bata dijiye?
            </div>
            <div className="flex h-6 items-center gap-[3px] pl-1">
              {WAVE.map((height, index) => (
                <i key={index} className="block w-[3px] rounded-full bg-accent-lime/70" style={{ height: `${height * 100}%` }} />
              ))}
            </div>
          </div>
        </div>

        <ul className="relative space-y-2.5 text-sm text-primary-foreground/85">
          {POINTS.map((point) => (
            <li key={point} className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-lime/20 text-[11px] text-accent-lime">✓</span>
              {point}
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="m-auto w-full max-w-xl px-4 py-8 sm:px-8 lg:py-5">{children}</div>
      </section>
    </div>
  );
}
