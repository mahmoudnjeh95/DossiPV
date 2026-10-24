import Link from 'next/link';

export default function NotFound(): React.JSX.Element {
  return (
    <main style={{ maxWidth: 480, margin: '15vh auto', padding: '0 16px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 22 }}>Page introuvable</h1>
      <p style={{ color: '#526174' }}>Cette page n&apos;existe pas ou a été déplacée.</p>
      <Link href="/dashboard">Retour au tableau de bord</Link>
    </main>
  );
}
