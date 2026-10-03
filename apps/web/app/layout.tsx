import type { ReactNode } from 'react';
import '../styles/palette.css';
import '../styles/icons.css';
import './globals.css';

export const metadata = {
  title: 'DossiPV',
  description: 'Générateur de dossiers techniques photovoltaïques BT',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
