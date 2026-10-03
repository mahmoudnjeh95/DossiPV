import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditCableForm } from './edit-form';

export default async function EditCablePage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const cable = await db.cable.findUnique({ where: { id }, include: { sections: true } });
  if (!cable) {
    notFound();
  }

  return <EditCableForm cable={cable} />;
}
