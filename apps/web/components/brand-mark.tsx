import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  /** On a dark background: the wordmark is white. */
  inverse?: boolean;
  /** Small lockup (sun symbol + name) for headers; the default is the full SolarixPro logo. */
  compact?: boolean;
  /** Compact lockup, smaller (the product card of the landing page). */
  small?: boolean;
  className?: string;
}

/** The SolarixPro sun: gold half-sun rising over a navy horizon, drawn to match the logo. */
export function SunSymbol({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="sx-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd25a" />
          <stop offset="1" stopColor="#e8a317" />
        </linearGradient>
        <linearGradient id="sx-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d4b97" />
          <stop offset="1" stopColor="#0b1f4a" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#sx-tile)" />
      <g className="sun-rays" stroke="#f5b82e" strokeWidth="2.4" strokeLinecap="round">
        <path d="M24 7v5M11.5 12.5l3.2 3.6M36.5 12.5l-3.2 3.6M6.5 25h4M41.5 25h-4" />
      </g>
      <path d="M12 33a12 12 0 0 1 24 0z" fill="url(#sx-sun)" />
      <path d="M7 36.5h34" stroke="#fff" strokeOpacity=".9" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13 41.5h22" stroke="#f5b82e" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark({ inverse = false, compact = false, small = false, className }: BrandMarkProps): React.JSX.Element {
  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-2.5 text-left no-underline', inverse ? 'text-white' : 'text-app-navy', className)}>
        <SunSymbol
          className={cn(
            'block size-[38px] flex-none drop-shadow-[0_4px_8px_rgba(11,31,74,0.25)] transition-transform duration-[350ms] ease-(--ease-out) group-hover:-rotate-6 group-hover:scale-[1.06]',
            small && 'size-[30px]',
          )}
        />
        <span className="grid leading-[1.1]">
          <strong className={cn('text-[1.3rem] font-extrabold tracking-[-0.02em]', small && 'text-[1.05rem]')}>
            Solarix<em className="text-app-gold not-italic">Pro</em>
          </strong>
        </span>
      </span>
    );
  }
  return (
    <span className={cn('block w-[clamp(150px,22vw,230px)]', inverse && 'text-white', className)}>
      <Image
        className="block h-auto w-full"
        src={inverse ? '/brand/logo-light.png' : '/brand/logo.png'}
        alt="SolarixPro Photovoltaïque"
        width={854}
        height={729}
        priority
      />
    </span>
  );
}
