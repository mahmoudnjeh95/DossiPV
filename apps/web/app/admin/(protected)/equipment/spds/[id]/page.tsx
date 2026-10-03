import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditSpdForm } from './edit-form';

export default async function EditSpdPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const spd = await db.spd.findUnique({ where: { id } });
  if (!spd) {
    notFound();
  }

  return <EditSpdForm spd={spd} />;
}
