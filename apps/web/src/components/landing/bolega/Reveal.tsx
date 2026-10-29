import { useEffect, useRef, useState, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

type RevealProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  children?: ReactNode;
};

/** Adds the landing page's `reveal` entrance; becomes `seen` once it first enters the viewport. */
export function Reveal({ as: Tag = 'div', className = '', children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(() => typeof window === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`${className} reveal${seen ? ' seen' : ''}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
