import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import '../styles/palette.css';
import '../styles/icons.css';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

export const metadata = {
  title: {
    default: 'DossiPV | Dossiers photovoltaïques BT',
    template: '%s | DossiPV',
  },
  description: 'Préparez et structurez vos dossiers techniques photovoltaïques basse tension.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="fr" className={plusJakartaSans.variable}>
      <body>{children}</body>
    </html>
  );
}
