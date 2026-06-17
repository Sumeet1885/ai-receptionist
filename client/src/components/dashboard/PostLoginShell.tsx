import React from 'react';

interface PostLoginShellProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const PostLoginShell: React.FC<PostLoginShellProps> = ({
  title,
  subtitle,
  actions,
  children
}) => {
  return (
    <div className="flex-1 bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl lg:text-3xl font-display font-extrabold text-brand-text">{title}</h2>
            {subtitle && <p className="text-sm text-brand-muted mt-1 font-sans">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
};
