import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedSuperAdmin } from '../../../layout';
import { EditPvModuleForm } from './edit-form';

export default async function EditPvModulePage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedSuperAdmin();
  const { id } = await params;

  const pvModule = await db.pvModule.findUnique({ where: { id } });
  if (!pvModule) {
    notFound();
  }

  return <EditPvModuleForm pvModule={pvModule} />;
}
