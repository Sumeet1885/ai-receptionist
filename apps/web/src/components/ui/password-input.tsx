import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './field';
import { cn } from '@/lib/utils';

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, disabled, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const Icon = visible ? EyeOff : Eye;
    return <div className="relative">
      <Input {...props} ref={ref} disabled={disabled} type={visible ? 'text' : 'password'} className={cn(className, 'pr-12')} />
      <button type="button" disabled={disabled} aria-label={visible ? 'Hide password' : 'Show password'} aria-controls={props.id} aria-pressed={visible} onClick={() => setVisible(value => !value)} className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-small text-text-subtle hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>;
  },
);
PasswordInput.displayName = 'PasswordInput';
