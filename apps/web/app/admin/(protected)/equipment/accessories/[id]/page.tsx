import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditAccessoryForm } from './edit-form';

export default async function EditAccessoryPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const accessory = await db.accessory.findUnique({ where: { id } });
  if (!accessory) {
    notFound();
  }

  return <EditAccessoryForm accessory={accessory} />;
}
