import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuthenticatedCompanyUser } from '../../../../layout';
import { updateOwnEquipmentAction } from '../../../own-equipment-actions';
import { loadOwnEquipment } from '../../../own-equipment-fields';
import { OwnEquipmentForm } from '../../../own-equipment-form';
import { ownEquipmentKindBySlug } from '../../../own-equipment-kinds';

/** Edits one of the company's own items; shared catalog items are not editable here. */
export default async function EditOwnEquipmentPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  const { kind, id } = await params;
  const entry = ownEquipmentKindBySlug(kind);
  const item = entry ? await loadOwnEquipment(entry.kind, id, user.companyId) : null;
  if (!entry || !item) {
    notFound();
  }

  return (
    <main>
      <p>
        <Link href="/library">← Ma bibliothèque</Link>
      </p>
      <h1>Modifier : {item.name}</h1>
      <p className="muted">
        {entry.label} — les dossiers déjà générés ne changent pas, les prochains utiliseront ces valeurs.
      </p>
      <OwnEquipmentForm action={updateOwnEquipmentAction.bind(null, entry.kind, id)} attached={item.attached}>
        {item.fields}
      </OwnEquipmentForm>
    </main>
  );
}
