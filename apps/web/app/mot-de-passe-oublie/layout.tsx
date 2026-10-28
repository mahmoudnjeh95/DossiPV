import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NO_INDEX } from '../../lib/site';

// The page is a client component, so its metadata lives here.
export const metadata: Metadata = { robots: NO_INDEX };

export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
