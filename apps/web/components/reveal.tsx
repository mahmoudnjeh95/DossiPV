'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  /** Stagger in milliseconds, for a row of cards that should appear one after the other. */
  delay?: number;
  as?: ElementType;
  className?: string;
}

/** Fades its content up the first time it scrolls into view; without JavaScript it simply shows. */
export function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }: RevealProps): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    setArmed(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(node);
    return (): void => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn(
        armed && 'transition-[opacity,transform] duration-700 ease-(--ease-out)',
        armed && !shown && 'translate-y-[22px] opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
