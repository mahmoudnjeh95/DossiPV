import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { createOwnEquipmentAction } from '../../own-equipment-actions';
import { newEquipmentFields } from '../../own-equipment-fields';
import { OwnEquipmentForm } from '../../own-equipment-form';
import { ownEquipmentKindBySlug } from '../../own-equipment-kinds';

export default async function NewOwnEquipmentPage({ params }: { params: Promise<{ kind: string }> }): Promise<React.JSX.Element> {
  await requireAuthenticatedCompanyUser();
  const entry = ownEquipmentKindBySlug((await params).kind);
  if (!entry) {
    notFound();
  }

  return (
    <main>
      <p>
        <Link href="/library/new">← Mon propre matériel</Link>
      </p>
      <h1>Nouveau matériel : {entry.label}</h1>
      <OwnEquipmentForm action={createOwnEquipmentAction.bind(null, entry.kind)}>{newEquipmentFields(entry.kind)}</OwnEquipmentForm>
    </main>
  );
}
