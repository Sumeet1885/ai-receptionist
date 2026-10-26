import { cn } from '@/lib/utils';

const marks = {
  weave: '/bolegaindia/images/bolegaindia-brand-weave.svg',
  logo: '/bolegaindia/images/bolegaindia-logo.svg',
} as const;

interface BrandLogoProps {
  /** `weave` is the navigation mark, `logo` the compact mark used in footers. */
  mark?: keyof typeof marks;
  /** `bare` renders only `<img/>Bolega<b>India</b>` for containers that style it themselves (the landing page). */
  bare?: boolean;
  className?: string;
  markClassName?: string;
}

/** "Bolega India" wordmark. The mark image is decorative; the text carries the accessible name. */
export function BrandLogo({ mark = 'weave', bare = false, className, markClassName }: BrandLogoProps) {
  if (bare) {
    return (
      <>
        <img src={marks[mark]} alt="" />
        Bolega<b>India</b>
      </>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-display text-xl font-extrabold tracking-[-0.04em] text-text', className)}>
      <img src={marks[mark]} alt="" className={cn('h-9 w-9 shrink-0', markClassName)} />
      <span>
        Bolega<b className="ml-1 font-medium">India</b>
      </span>
    </span>
  );
}
