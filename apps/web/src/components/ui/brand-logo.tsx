import { cn } from '@/lib/utils';

const logos = {
  color: '/bolegaindia/brand/bolegaindia-logo.png',
  white: '/bolegaindia/brand/bolegaindia-logo-white.png',
} as const;

interface BrandLogoProps {
  /** `color` for light backgrounds, `white` for dark ones. */
  tone?: keyof typeof logos;
  /** `bare` renders only the image, for containers that size it themselves (the landing page). */
  bare?: boolean;
  className?: string;
}

/** The BolegaIndia.ai logo (mark and wordmark in one image). */
export function BrandLogo({ tone = 'color', bare = false, className }: BrandLogoProps) {
  return (
    <img
      src={logos[tone]}
      alt="Bolega India"
      width={645}
      height={141}
      className={bare ? className : cn('h-9 w-auto shrink-0', className)}
    />
  );
}
