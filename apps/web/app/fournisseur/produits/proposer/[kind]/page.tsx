import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSupplier } from '../../../../../lib/supplier-access';
import { PvModuleFields } from '../../../../../components/equipment/pv-module-fields';
import { InverterFields } from '../../../../../components/equipment/inverter-fields';
import { ProposeForm } from './propose-form';

export default async function ProposeProductPage({ params }: { params: Promise<{ kind: string }> }): Promise<React.JSX.Element> {
  await requireSupplier();
  const { kind } = await params;
  if (kind !== 'PV_MODULE' && kind !== 'INVERTER') notFound();

  return (
    <main>
      <p>
        <Link href="/fournisseur/produits">← Produits</Link>
      </p>
      <h1>Proposer {kind === 'PV_MODULE' ? 'un panneau' : 'un onduleur'}</h1>
      <ProposeForm kind={kind}>{kind === 'PV_MODULE' ? <PvModuleFields /> : <InverterFields />}</ProposeForm>
    </main>
  );
}
