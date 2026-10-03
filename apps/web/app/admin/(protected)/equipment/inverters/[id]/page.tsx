import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditInverterForm } from './edit-form';

export default async function EditInverterPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const inverter = await db.inverter.findUnique({ where: { id } });
  if (!inverter) {
    notFound();
  }

  return <EditInverterForm inverter={inverter} />;
}
