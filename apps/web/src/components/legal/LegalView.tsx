import { ArrowLeft, LifeBuoy } from 'lucide-react';
import { publicTexture } from '../../lib/publicTexture';
import { LEGAL, PRIVACY_SECTIONS, TERMS_SECTIONS } from '../../lib/legal';
import { openSupport } from '../../lib/supportDrawer';

export function LegalView({
  type,
  navigate,
  signedIn = false,
}: {
  type: 'privacy' | 'terms';
  navigate: (path: string) => void;
  signedIn?: boolean;
}) {
  const title = type === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions';
  const sections = type === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  return (
    <div style={publicTexture(type === 'privacy' ? 'leaf' : 'weave')} className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <button
        type="button"
        onClick={() => navigate(signedIn ? '/dashboard' : '/')}
        className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary"
      >
        <ArrowLeft size={16} /> {signedIn ? 'Back to workspace' : 'Back to home'}
      </button>
      <div className="mb-8 border-b border-border pb-7">
        <p className="text-sm font-semibold text-primary">Bolega India · {LEGAL.legalEntity}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-text-subtle">Effective {LEGAL.effectiveDate}</p>
        <p className="mt-3 max-w-3xl text-base leading-7 text-text-subtle">{LEGAL.attribution}</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
        <aside>
          <nav
            aria-label="On this page"
            className="space-y-1 rounded-xl border border-border bg-surface p-4 lg:sticky lg:top-24"
          >
            <p className="mb-3 text-sm font-semibold">On this page</p>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-md px-2 py-1.5 text-sm text-text-subtle hover:bg-background hover:text-primary"
              >
                {section.title}
              </a>
            ))}
            <a href="#contact" className="block px-2 py-1.5 text-sm text-text-subtle hover:text-primary">
              Contact us
            </a>
            <div className="mt-3 border-t border-border pt-3">
              <a
                href={type === 'privacy' ? '/terms' : '/privacy'}
                className="block px-2 py-2 text-sm font-medium text-primary"
              >
                {type === 'privacy' ? 'Terms & Conditions' : 'Privacy Policy'} →
              </a>
            </div>
          </nav>
        </aside>
        <article className="min-w-0 space-y-8">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              <h2 className="mb-3 font-display text-xl font-semibold">{section.title}</h2>
              {section.paragraphs?.map((text) => (
                <p key={text} className="mb-3 text-base leading-7 text-text-subtle">
                  {text}
                </p>
              ))}
              {section.items && (
                <ul className="list-disc space-y-2 pl-5 text-base leading-7 text-text-subtle">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <section id="contact" className="scroll-mt-28 rounded-xl border border-border bg-surface p-5">
            <h2 className="font-display text-xl font-semibold">Contact us</h2>
            <p className="mt-3 text-base leading-7 text-text-subtle">
              For {type === 'privacy' ? 'privacy questions or data requests' : 'questions about these terms'},
              contact {LEGAL.legalEntity} through our support desk or the shared company contact below.
            </p>
            <address className="mt-4 space-y-2 text-sm not-italic leading-6">
              <p>
                <a className="text-primary underline underline-offset-2" href={`mailto:${LEGAL.email}`}>
                  {LEGAL.email}
                </a>
              </p>
              <p>
                <a className="text-primary" href={`tel:${LEGAL.phone.replace(/\s/g, '')}`}>
                  {LEGAL.phone}
                </a>
              </p>
              <p className="text-text-subtle">{LEGAL.address}</p>
            </address>
            <button
              type="button"
              onClick={() => openSupport({ view: 'new' })}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <LifeBuoy size={16} /> Contact support
            </button>
          </section>
        </article>
      </div>
    </div>
  );
}
