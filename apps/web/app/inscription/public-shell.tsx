import { AuthShell } from '@/components/auth/auth-ui';

// The two-panel look shared by the public sign-up pages (/inscription, /verifier-email).
export function PublicShell({
  titleId,
  eyebrow,
  children,
}: {
  titleId: string;
  eyebrow: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AuthShell story="trial" titleId={titleId} eyebrow={eyebrow}>
      {children}
    </AuthShell>
  );
}
