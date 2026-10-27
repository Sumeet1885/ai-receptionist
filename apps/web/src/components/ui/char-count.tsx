import { cn } from '@/lib/utils';

/** "120 / 1000" under a text box; turns red at the limit. */
export function CharCount({ value, max, className }: { value: string; max: number; className?: string }) {
  return (
    <p className={cn('mt-1 text-right text-xs tabular-nums', value.length >= max ? 'text-danger' : 'text-text-subtle', className)} aria-live="polite">
      {value.length} / {max}
    </p>
  );
}
