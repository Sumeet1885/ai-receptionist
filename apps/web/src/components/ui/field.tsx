import * as React from 'react';

import { cn } from '@/lib/utils';

/** Shared look for text inputs, selects and textareas. Error state via `aria-invalid`. */
export const fieldClassName =
  'w-full rounded-small border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-text-subtle transition-colors duration-[var(--duration-fast)] hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-danger aria-invalid:ring-danger/20';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldClassName, className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldClassName, 'min-h-28', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-text', className)} {...props} />;
}
