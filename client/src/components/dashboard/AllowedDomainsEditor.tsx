import React from 'react';
import { Icons } from '../common/Icons';

interface AllowedDomainsEditorProps {
  domains: string[];
  onChange: (domains: string[]) => void;
  label?: string;
  description?: string;
  placeholder?: string;
}

export const AllowedDomainsEditor: React.FC<AllowedDomainsEditorProps> = ({
  domains,
  onChange,
  label = 'Allowed Domains',
  description = 'Add one domain per row. These are the websites allowed to load the widget.',
  placeholder = 'yourbusiness.com'
}) => {
  const updateDomain = (index: number, value: string) => {
    const next = [...domains];
    next[index] = value;
    onChange(next);
  };

  const addDomain = () => onChange([...(domains.length ? domains : ['']), '']);
  const removeDomain = (index: number) => onChange(domains.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">
            {label}
          </label>
          <p className="text-xs text-brand-muted font-sans">{description}</p>
        </div>
        <button
          type="button"
          onClick={addDomain}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-brand-border bg-brand-bg hover:bg-brand-card text-brand-text text-sm font-semibold transition"
        >
          <Icons.Plus />
          <span>Add domain</span>
        </button>
      </div>

      <div className="space-y-2">
        {(domains.length ? domains : ['']).map((domain, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={domain}
              onChange={(e) => updateDomain(index, e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-brand-bg border border-brand-border rounded-md px-4 py-3 text-brand-text focus:outline-none focus:border-brand-accent transition font-sans text-sm"
            />
            <button
              type="button"
              onClick={() => removeDomain(index)}
              disabled={domains.length === 1 && !domain}
              className="px-3 py-3 rounded-md border border-brand-border bg-brand-bg hover:bg-brand-danger/10 hover:border-brand-danger/40 text-brand-danger text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={`Delete domain ${index + 1}`}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
