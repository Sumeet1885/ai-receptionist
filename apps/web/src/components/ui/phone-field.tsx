import * as React from 'react';
import PhoneInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';
import './phone-field.css';

import { cn } from '@/lib/utils';

interface PhoneFieldProps {
  id?: string;
  value: string;
  /** International format (+919876543210), or '' when empty. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Tighter padding, for the free-access form. */
  compact?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Phone number with a country picker (India by default). The number is checked by the same
 * libphonenumber rules in the browser and the API, so what this accepts is what the API accepts.
 */
export function PhoneField({ id, value, onChange, onBlur, placeholder = '98765 43210', required, disabled, compact, className, ...aria }: PhoneFieldProps) {
  return (
    <PhoneInput
      id={id}
      flags={flags}
      international
      defaultCountry="IN"
      countryCallingCodeEditable={false}
      limitMaxLength
      autoComplete="tel"
      value={value || undefined}
      onChange={(next) => onChange(next ?? '')}
      onBlur={onBlur}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-invalid={aria['aria-invalid']}
      aria-describedby={aria['aria-describedby']}
      className={cn('bi-phone-field', compact && 'bi-phone-field--compact', aria['aria-invalid'] && 'bi-phone-field--error', className)}
    />
  );
}
