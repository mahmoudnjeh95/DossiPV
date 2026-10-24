'use client';

import { useEffect, useRef, useState } from 'react';

/** A number that counts up from zero when it first scrolls into view. */
export function CountUp({ to, suffix = '' }: { to: number; suffix?: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setValue(0);
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const duration = 1200;
      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / duration);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [to]);

  return <span ref={ref}>{value}{suffix}</span>;
}
