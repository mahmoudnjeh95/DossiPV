'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * A success banner shown after a redirect carrying `?param=…`. It removes that query parameter
 * from the address once displayed, so a reload (or a shared link) does not show it again.
 */
export function FlashBanner({ param, children }: { param: string; children: ReactNode }): React.JSX.Element {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(param)) return;
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Cosmetic only: the banner simply stays in the address.
    }
  }, [param]);
  return (
    <div className="banner banner-ok" role="status">
      {children}
    </div>
  );
}
