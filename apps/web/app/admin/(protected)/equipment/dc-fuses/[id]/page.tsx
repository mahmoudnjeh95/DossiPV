import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditDcFuseForm } from './edit-form';

export default async function EditDcFusePage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const dcFuse = await db.dcFuse.findUnique({ where: { id } });
  if (!dcFuse) {
    notFound();
  }

  return <EditDcFuseForm dcFuse={dcFuse} />;
}
