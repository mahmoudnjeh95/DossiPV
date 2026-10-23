import Link from 'next/link';
import { requireAuthenticatedCompanyUser } from '../../layout';
import { LibraryTabs } from '../library-tabs';
import { OWN_EQUIPMENT_KINDS } from '../own-equipment-kinds';

/** Choice of the equipment type the installer adds as its own (absent from the shared catalog). */
export default async function NewOwnEquipmentIndexPage(): Promise<React.JSX.Element> {
  await requireAuthenticatedCompanyUser();

  return (
    <main>
      <h1>Ma bibliothèque</h1>
      <LibraryTabs active="new" />
      <section className="card stack">
        <h2>Ajouter mon propre matériel</h2>
        <p>
          Vous installez un équipement absent du catalogue partagé ? Saisissez ses caractéristiques : il rejoint votre
          bibliothèque, il est proposé dans vos projets et n&apos;est visible que par votre société.
        </p>
        <p className="hint">
          Vous êtes responsable de ces valeurs : reprenez-les de la fiche technique du fabricant et joignez-la, elle est annexée
          au dossier STEG.
        </p>
        <div className="actions">
          {OWN_EQUIPMENT_KINDS.map((entry) => (
            <Link key={entry.kind} href={`/library/new/${entry.slug}`} className="button secondary">
              {entry.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
