import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSponsored } from '../../../../lib/sponsorship';
import { requireAuthenticatedCompanyUser } from '../../layout';
import { LibraryTabs } from '../library-tabs';
import { OWN_EQUIPMENT_KINDS } from '../own-equipment-kinds';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

/** Choice of the equipment type the installer adds as its own (absent from the shared catalog). */
export default async function NewOwnEquipmentIndexPage(): Promise<React.JSX.Element> {
  const user = await requireAuthenticatedCompanyUser();
  // A sponsored installer uses its supplier's panels and inverters: no own equipment.
  if (await isSponsored(user.companyId)) {
    redirect('/library');
  }

  return (
    <main>
      <h1>Ma bibliothèque</h1>
      <LibraryTabs active="new" />
      <Card as="section" className="flex flex-col gap-3">
        <h2>Ajouter mon propre matériel</h2>
        <p>
          Vous installez un équipement absent du catalogue partagé ? Saisissez ses caractéristiques : il rejoint votre
          bibliothèque, il est proposé dans vos projets et n&apos;est visible que par votre société.
        </p>
        <p className="text-[0.8rem] font-normal text-app-muted">
          Vous êtes responsable de ces valeurs : reprenez-les de la fiche technique du fabricant et joignez-la, elle est annexée
          au dossier STEG.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {OWN_EQUIPMENT_KINDS.map((entry) => (
            <Link key={entry.kind} href={`/library/new/${entry.slug}`} className={buttonVariants({ variant: 'secondary' })}>
              {entry.label}
            </Link>
          ))}
        </div>
      </Card>
    </main>
  );
}
