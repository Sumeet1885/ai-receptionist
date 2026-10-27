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

export const LOGO = '/bolegaindia/images/bolegaindia-logo.svg';
