import React from 'react';
import { publicTexture, type PublicTexture } from '../../lib/publicTexture';

const ASSISTANT_PORTRAIT = '/bolegaindia/images/hero-ai-human-assistant.webp';
const BRAND_WEAVE = '/bolegaindia/images/bolegaindia-brand-weave.svg';
const INDIA_ARTWORK = '/bolegaindia/images/hero-india-culture-artwork.svg';

const POINTS = [
  'Answers in your customers’ language',
  'Captures and qualifies every lead',
  'Books appointments on your calendar',
];

const ACCESS_STEPS = [
  { title: 'Tell us about your business', body: 'One short form. No card, no commitment.' },
  { title: 'Our team reviews it', body: 'Usually within one working day.' },
  { title: 'Activate your workspace', body: 'Verify your email to start your 7-day trial, then set up your receptionist.' },
];

const HELLOS = [
  { text: 'नमस्ते', lang: 'hi' },
  { text: 'Hello', lang: 'en' },
  { text: 'வணக்கம்', lang: 'ta' },
  { text: 'নমস্কার', lang: 'bn' },
  { text: 'నమస్కారం', lang: 'te' },
  { text: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', lang: 'pa' },
];

// Decorative bars echoing the landing page's conversation waveform.
const WAVE = [0.35, 0.7, 0.5, 0.9, 0.6, 1, 0.45, 0.8, 0.55, 0.95, 0.4, 0.75, 0.5, 0.85, 0.3];

export type AuthArt = 'signin' | 'request';

function ConversationArt() {
  return (
    <>
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-lime">Welcome back</p>
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
          <div className="flex h-6 items-center gap-0.75 pl-1">
            {WAVE.map((height, index) => (
              <i key={index} className="block w-0.75 rounded-full bg-accent-lime/70" style={{ height: `${height * 100}%` }} />
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
    </>
  );
}

function AccessArt() {
  return (
    <>
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-lime">7-day free trial</p>
        <div className="mt-4 flex items-end gap-4">
          <img src={INDIA_ARTWORK} alt="" className="h-[clamp(3.5rem,8vh,5rem)] w-auto brightness-110" />
          <span lang="hi" className="font-devanagari text-[clamp(2.4rem,4vw,3.6rem)] font-semibold leading-none text-accent-lime">बोलेगा</span>
        </div>
        <p className="mt-4 max-w-md font-display text-[clamp(1.4rem,2vw,1.9rem)] font-semibold leading-[1.15] tracking-[-0.03em]">
          Your business, speaking every customer’s language.
        </p>
      </div>

      <ol className="relative my-6 space-y-4">
        {ACCESS_STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-lime/50 font-display text-sm font-semibold text-accent-lime">
              {index + 1}
            </span>
            <span>
              <span className="block font-semibold">{step.title}</span>
              <span className="block text-sm text-primary-foreground/70">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="relative flex flex-wrap gap-2">
        {HELLOS.map((hello, index) => (
          <span
            key={hello.text}
            lang={hello.lang}
            className={`rounded-pill px-3.5 py-1.5 text-sm ${index % 3 === 0 ? 'bg-accent-lime text-text' : 'bg-white/10 text-primary-foreground/90'}`}
          >
            {hello.text}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Sign-in and access-request layout: brand art on the left (desktop only), form on the right.
 * On large screens it fills the space under the header exactly, so the page never scrolls;
 * only the form column can scroll, and only on unusually short screens.
 */
export function AuthSplitLayout({ art, texture, children }: { art: AuthArt; texture?: PublicTexture; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        aria-hidden="true"
        className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-text px-10 py-9 text-primary-foreground lg:flex xl:px-14 xl:py-11"
      >
        <img src={BRAND_WEAVE} alt="" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 opacity-[0.07]" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-accent-lime/20 blur-[110px]" />
        {art === 'request' ? <AccessArt /> : <ConversationArt />}
      </aside>

      <section style={publicTexture(texture ?? (art === 'request' ? 'lotus' : 'jaali'))} className="flex min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="m-auto w-full max-w-xl px-4 py-8 sm:px-8 lg:py-5 lg:[@media(max-height:800px)]:py-3">{children}</div>
      </section>
    </div>
  );
}
