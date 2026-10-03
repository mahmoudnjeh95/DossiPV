import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditAcIsolatorForm } from './edit-form';

export default async function EditAcIsolatorPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const acIsolator = await db.acIsolator.findUnique({ where: { id } });
  if (!acIsolator) {
    notFound();
  }

  return <EditAcIsolatorForm acIsolator={acIsolator} />;
}
