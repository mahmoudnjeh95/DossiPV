import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditDcSwitchForm } from './edit-form';

export default async function EditDcSwitchPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const dcSwitch = await db.dcSwitch.findUnique({ where: { id } });
  if (!dcSwitch) {
    notFound();
  }

  return <EditDcSwitchForm dcSwitch={dcSwitch} />;
}
