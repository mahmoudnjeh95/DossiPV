import Link from 'next/link';
import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { isSponsored } from '../../../../../lib/sponsorship';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { createOwnEquipmentAction } from '../../own-equipment-actions';
import { newEquipmentFields } from '../../own-equipment-fields';
import { OwnEquipmentForm } from '../../own-equipment-form';
import { ownEquipmentKindBySlug } from '../../own-equipment-kinds';

export default async function NewOwnEquipmentPage({ params }: { params: Promise<{ kind: string }> }): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  // A sponsored installer uses its supplier's panels and inverters: no own equipment.
  if (await isSponsored(user.companyId)) {
    redirect('/library');
  }
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
