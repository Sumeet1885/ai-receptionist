import type { AnchorHTMLAttributes, MouseEvent } from 'react';

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  navigate: (path: string) => void;
};

/** A real link (middle-click, copy link and keyboard all work) that routes inside the SPA on a normal click. */
export function AppLink({ to, navigate, onClick, ...rest }: AppLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handleClick} {...rest} />;
}
