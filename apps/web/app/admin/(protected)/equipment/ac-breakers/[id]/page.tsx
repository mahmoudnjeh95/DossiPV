import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditAcBreakerForm } from './edit-form';

export default async function EditAcBreakerPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const acBreaker = await db.acBreaker.findUnique({ where: { id } });
  if (!acBreaker) {
    notFound();
  }

  return <EditAcBreakerForm acBreaker={acBreaker} />;
}
