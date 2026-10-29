import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Bolega India buttons. Pill-shaped like the landing page; colours come from the theme tokens.
 * Focus uses the global :focus-visible ring (orange). Disabled is the same for every variant.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-body font-semibold transition-[background-color,border-color,color,transform] duration-[var(--duration-base)] ease-[var(--ease-standard)] disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground disabled:border-transparent',
  {
    variants: {
      variant: {
        /** Main action: ink, turns forest green on hover (landing `.btn`). */
        primary: 'bg-text text-primary-foreground hover:bg-primary hover:-translate-y-0.5 active:bg-primary-active active:translate-y-0',
        /** Selected call-to-action: orange. */
        accent: 'bg-accent-orange-strong text-white hover:bg-accent-orange-hover hover:-translate-y-0.5 active:translate-y-0',
        /** Quiet action on ivory (landing `.btn.light`). */
        secondary: 'border border-border bg-surface text-text hover:border-border-strong hover:bg-background',
        ghost: 'text-text hover:bg-surface-sunken',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'rounded-none px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-7 text-sm',
        icon: 'h-10 w-10',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto' }],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
