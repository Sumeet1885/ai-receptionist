import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { AccessRequestStatus } from './api';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const BUTTON = {
  primary: 'bg-ink text-white hover:bg-primary',
  secondary: 'border border-line bg-surface text-ink hover:border-primary/40 hover:bg-background',
  success: 'bg-primary text-white hover:bg-ink',
  danger: 'bg-danger text-white hover:bg-danger/90',
  dangerOutline: 'border border-danger/40 bg-surface text-danger hover:bg-danger-surface',
  ghost: 'text-subtle hover:bg-background hover:text-ink',
  // On the dark brand surfaces (hero, headers).
  lime: 'bg-lime text-ink hover:bg-white',
  glass: 'bg-white/10 text-white hover:bg-white/20',
} as const;

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-surface shadow-card', className)}>{children}</div>;
}

export const STATUS_LABELS: Record<AccessRequestStatus, string> = {
  pending: 'Pending',
  contacted: 'Contacted',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_STYLES: Record<AccessRequestStatus, string> = {
  pending: 'bg-warning-surface text-warning',
  contacted: 'bg-info-surface text-info',
  approved: 'bg-success-surface text-success',
  rejected: 'bg-danger-surface text-danger',
};

export function StatusBadge({ status }: { status: AccessRequestStatus }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLES[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function timeAgo(value: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

// Served by the web app (same domain). LOGO for light surfaces, LOGO_WHITE for the dark sign-in screen.
export const LOGO = '/bolegaindia/brand/bolegaindia-logo.png';
export const LOGO_WHITE = '/bolegaindia/brand/bolegaindia-logo-white.png';

// ── form pieces ──────────────────────────────────────────────────────────────

export const INPUT = 'h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-subtle/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 aria-invalid:border-danger';

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-ink">
        {label} {hint && <span className="font-normal text-subtle">{hint}</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-left"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-subtle">{description}</span>}
      </span>
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-line')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** Right-hand panel for create/edit forms. */
export function Drawer({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl">
        <div className="border-b border-line px-6 py-5">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-subtle">{subtitle}</p>}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-line bg-background/60 px-6 py-4">{footer}</div>
      </div>
    </div>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', active ? 'bg-success-surface text-success' : 'bg-background text-subtle')}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {active ? 'Active' : 'Off'}
    </span>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-subtle">
      <span>Page {page} of {pages}</span>
      <Button variant="secondary" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</Button>
      <Button variant="secondary" size="sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</Button>
    </div>
  );
}

/** Pill tabs used to filter tables. */
export function FilterTabs<T>({ tabs, value, onChange }: { tabs: Array<{ value: T; label: string }>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => (
        <button
          key={tab.label}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cx('cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', value === tab.value ? 'bg-ink text-white' : 'bg-surface text-subtle hover:text-ink')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Whole rupees/dollars in a form ↔ minor units in the API. */
export const toMinor = (major: string) => (major.trim() === '' ? 0 : Math.round(Number(major) * 100));
export const toMajor = (minor: number | null | undefined) => (minor ? String(minor / 100) : '');
