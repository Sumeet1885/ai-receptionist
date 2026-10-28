import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandLogo } from '../../ui/brand-logo';
import { AppLink } from './AppLink';
import { FolkNavBorder } from '../../layout/FolkNavBorder';
import { publicTexture } from '../../../lib/publicTexture';

const sections = [
  { id: 'product-persona', label: 'Product' },
  { id: 'workflow', label: 'How it works' },
  { id: 'use-cases', label: 'Use cases' },
  { id: 'questions', label: 'FAQs' },
];

interface LandingNavProps {
  navigate: (path: string) => void;
  signedIn: boolean;
  userMenu?: ReactNode;
}

export function LandingNav({ navigate, signedIn, userMenu }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      setScrolled(window.scrollY > 25);
      setProgress(scrollable > 0 ? (100 * window.scrollY) / scrollable : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && setActive(entry.target.id)),
      { rootMargin: '-20% 0px -50% 0px' },
    );
    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !toggleRef.current?.contains(target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [menuOpen]);

  const primary = signedIn
    ? { to: '/dashboard', label: 'Open dashboard ↗' }
    : { to: '/request-access', label: '14-day free trial' };
  const secondary = signedIn ? { to: '/dashboard', label: 'Dashboard' } : { to: '/auth?mode=signin', label: 'Sign in' };

  return (
    <>
      <div className="progress" aria-hidden="true" style={{ width: `${progress}%` }} />
      <header style={{ ...publicTexture('leaf'), backgroundColor: 'var(--color-background)' }} className={`nav${scrolled ? ' scrolled' : ''}`}>
        <FolkNavBorder />
        <a className="brand" href="#" aria-label="Bolega India home">
          <BrandLogo bare />
        </a>
        <nav className="nav-center" aria-label="Main navigation">
          {sections.map(({ id, label }) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : undefined}>
              {label}
            </a>
          ))}
          <AppLink to="/pricing" navigate={navigate}>
            Pricing
          </AppLink>
        </nav>
        <div className="nav-actions">
          {userMenu || <AppLink className="btn light nav-signin" to={secondary.to} navigate={navigate}>
            {secondary.label}
          </AppLink>}
          <AppLink className="btn" to={primary.to} navigate={navigate}>
            {primary.label}
          </AppLink>
          <button
            ref={toggleRef}
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? '×' : '☰'}
          </button>
        </div>
      </header>
      <nav ref={menuRef} id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation" hidden={!menuOpen}>
        {sections.map(({ id, label }, i) => (
          <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>
            {label} <span>{String(i + 1).padStart(2, '0')}</span>
          </a>
        ))}
        <AppLink to="/pricing" navigate={navigate} onClick={() => setMenuOpen(false)}>
          Pricing ↗
        </AppLink>
        <AppLink to={secondary.to} navigate={navigate} onClick={() => setMenuOpen(false)}>
          {secondary.label} ↗
        </AppLink>
      </nav>
    </>
  );
}
