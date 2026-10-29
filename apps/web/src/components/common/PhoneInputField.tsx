import React, { useState, useId } from 'react';
import PhoneInput, { getCountryCallingCode, Country } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';
import { validateContactInput } from '../../lib/contactValidation';

export interface PhoneInputFieldProps {
  value: string;
  onChange: (val: string) => void;
  defaultCountry?: Country;
  placeholder?: string;
  label?: string;
  description?: string;
  helperText?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  showQuickCountries?: boolean;
  onCountryChange?: (country: Country) => void;
}

const POPULAR_COUNTRIES: { code: Country; name: string; dial: string }[] = [
  { code: 'IN', name: 'India', dial: '+91' },
  { code: 'US', name: 'US / Canada', dial: '+1' },
  { code: 'GB', name: 'UK', dial: '+44' },
  { code: 'AE', name: 'UAE', dial: '+971' },
  { code: 'AU', name: 'Australia', dial: '+61' },
  { code: 'SG', name: 'Singapore', dial: '+65' },
];

/**
 * Custom Country Select trigger & dropdown.
 * Renders a crisp SVG flag and ALWAYS visible country calling code (+91, +1, etc.)
 * in high-contrast emerald/white text.
 */
const CustomCountrySelect: React.FC<{
  value?: Country;
  onChange: (value: Country) => void;
  options: { value?: Country; label: string }[];
  disabled?: boolean;
}> = ({ value, onChange, options, disabled }) => {
  const callingCode = value ? getCountryCallingCode(value) : '';
  const FlagComponent = value && flags[value] ? flags[value] : null;

  return (
    <div className="relative flex items-center gap-2 h-full px-3 py-2 bg-brand-bg/90 border-r border-brand-border/60 hover:bg-brand-bg transition cursor-pointer select-none group shrink-0">
      {/* SVG Flag */}
      <div className="w-6 h-4 rounded-[3px] overflow-hidden shadow-sm flex items-center justify-center shrink-0 border border-brand-border bg-black/40">
        {FlagComponent ? (
          <FlagComponent title={value || 'Country'} />
        ) : (
          <span className="text-xs">🌐</span>
        )}
      </div>

      {/* Country Calling Code (ALWAYS VISIBLE & HIGH CONTRAST) */}
      <span className="font-body font-bold text-xs text-brand-accent tracking-tight shrink-0">
        {callingCode ? `+${callingCode}` : ''}
      </span>

      {/* Down Chevron */}
      <svg
        className="w-3 h-3 text-brand-muted/70 group-hover:text-brand-accent transition shrink-0 ml-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>

      {/* Accessible native select overlaid with dark mode option styling */}
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value as Country)}
        disabled={disabled}
        aria-label="Select Country Code"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
      >
        {options.map(opt => {
          const optCode = opt.value ? getCountryCallingCode(opt.value) : '';
          return (
            <option
              key={opt.value || 'intl'}
              value={opt.value || ''}
              className="bg-surface text-text py-1 text-sm font-sans"
            >
              {opt.label} {optCode ? `(+${optCode})` : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
};

export const PhoneInputField: React.FC<PhoneInputFieldProps> = ({
  value,
  onChange,
  defaultCountry = 'IN',
  placeholder = 'Enter phone number (e.g. 98765 43210)',
  label,
  description,
  helperText,
  error,
  required = false,
  disabled = false,
  id,
  className = '',
  showQuickCountries = false,
  onCountryChange,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [currentCountry, setCurrentCountry] = useState<Country>(defaultCountry);

  const handleCountryChange = (c?: Country) => {
    if (c) {
      setCurrentCountry(c);
      onCountryChange?.(c);
    }
  };

  const handleQuickCountrySelect = (countryCode: Country) => {
    if (disabled) return;
    setCurrentCountry(countryCode);
    const dialCode = `+${getCountryCallingCode(countryCode)}`;
    // If value is empty or has another country's prefix, update to this dial code
    if (!value || value.startsWith('+')) {
      onChange(dialCode);
    }
    onCountryChange?.(countryCode);
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
  };

  // Validation status
  const validation = value ? validateContactInput('phone', value) : null;
  const isValid = validation?.valid;
  const isInvalid = Boolean(value && !isValid);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Label & Header */}
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="block text-xs font-bold text-brand-text flex items-center gap-1.5">
            <span>{label}</span>
            {required && <span className="text-rose-700 font-bold">*</span>}
          </label>

          {/* Format / Validity Badge */}
          {value ? (
            isValid ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-body font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Valid E.164
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-body font-medium text-amber-700 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Incomplete
              </span>
            )
          ) : (
            <span className="text-[10px] font-body text-brand-muted/70">
              International (E.164)
            </span>
          )}
        </div>
      )}

      {description && (
        <p className="text-[11px] text-brand-muted leading-relaxed">
          {description}
        </p>
      )}

      {/* Main Input Container */}
      <div
        className={`group relative flex items-center bg-brand-card rounded-xl border transition shadow-sm overflow-hidden ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-brand-border/40'
            : isInvalid
            ? 'border-amber-500/60 ring-1 ring-amber-500/20'
            : isValid
            ? 'border-emerald-500/50 ring-1 ring-emerald-500/20'
            : 'border-brand-border hover:border-brand-accent/50 focus-within:border-brand-accent focus-within:ring-2 focus-within:ring-brand-accent/20'
        }`}
      >
        <div className="flex-1 min-w-0">
          <PhoneInput
            id={inputId}
            flags={flags}
            country={currentCountry}
            defaultCountry={defaultCountry}
            countrySelectComponent={CustomCountrySelect}
            onCountryChange={handleCountryChange}
            placeholder={placeholder}
            value={value}
            onChange={val => onChange(val || '')}
            disabled={disabled}
            international
            withCountryCallingCode
            className="w-full"
          />
        </div>

        {/* Clear Button */}
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2 mr-1 text-brand-muted hover:text-brand-text hover:bg-brand-bg rounded-lg transition"
            title="Clear number"
            aria-label="Clear number"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Quick Country Switcher Chips */}
      {showQuickCountries && (
        <div className="pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted mr-1">
              Quick Country:
            </span>
            {POPULAR_COUNTRIES.map(c => {
              const isActive = currentCountry === c.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleQuickCountrySelect(c.code)}
                  disabled={disabled}
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-lg border transition flex items-center gap-1 ${
                    isActive
                      ? 'bg-brand-accent/15 border-brand-accent text-brand-accent font-bold'
                      : 'bg-brand-bg/60 border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-accent/40'
                  }`}
                >
                  <span className="font-body text-[10px]">{c.dial}</span>
                  <span>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Helper text or Error message */}
      {error ? (
        <p className="text-xs text-rose-700 font-medium flex items-center gap-1 mt-1">
          <span>⚠️</span>
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-[11px] text-brand-muted mt-1">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};
