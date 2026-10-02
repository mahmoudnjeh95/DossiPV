import type { ReactNode } from 'react';

export const metadata = {
  title: 'DossiPV',
  description: 'Générateur de dossiers techniques photovoltaïques BT',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
