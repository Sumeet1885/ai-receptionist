import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/** Page-width wrapper with the theme gutter. */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8', className)} {...props} />;
}

const cardVariants = cva('rounded-medium border text-text', {
  variants: {
    variant: {
      /** Warm white card on ivory. */
      default: 'border-border bg-surface shadow-card',
      /** Flat inset area inside a card. */
      sunken: 'border-border bg-surface-sunken',
      /** Raised panel such as a dialog or popover. */
      floating: 'border-border bg-surface shadow-floating',
      /** Lime highlight for an emphasised summary. */
      highlight: 'border-accent-lime bg-accent-lime-soft',
    },
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-5 sm:p-6',
      lg: 'p-6 sm:p-8',
    },
  },
  defaultVariants: { variant: 'default', padding: 'md' },
});

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, padding, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant, padding }), className)} {...props} />
));
Card.displayName = 'Card';

interface SectionHeadingProps {
  /** Small uppercase label above the title. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Optional second line set in the italic accent face. */
  accent?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Heading level; defaults to h2. */
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}

/** Eyebrow + display title (+ italic accent) + description, as used across the landing page and app screens. */
export function SectionHeading({ eyebrow, title, accent, description, actions, as: Heading = 'h2', className }: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-subtle">{eyebrow}</p>}
        <Heading className="font-display text-2xl font-semibold leading-tight tracking-[-0.035em] text-text lg:text-3xl">
          {title}
          {accent && (
            <>
              {' '}
              <em className="font-accent font-normal italic">{accent}</em>
            </>
          )}
        </Heading>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-text-subtle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
