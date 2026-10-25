'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { proposeSupplierProductAction, type SupplierProductActionState } from '../../actions';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The product's shared fields (`children`), then its datasheet file and the manufacturer's datasheet link. */
export function ProposeForm({ kind, children }: { kind: string; children: ReactNode }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SupplierProductActionState, FormData>(proposeSupplierProductAction.bind(null, kind), undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Card as="section">
        <h2>Caractéristiques</h2>
        <p className="text-[0.8rem] font-normal text-app-muted">
          Reprenez les valeurs de la fiche technique du fabricant, dans l’unité indiquée entre parenthèses (utilisez le point pour les
          décimales, ex. 41.8). Les exemples grisés ne sont là que pour illustrer le format. Les champs marqués « optionnel » peuvent rester
          vides.
        </p>
        <p className="text-[0.8rem] font-normal text-app-muted">
          {kind === 'PV_MODULE'
            ? 'Les valeurs électriques (Pmax, Vmp, Imp, Voc, Isc) sont celles des conditions STC, en première page de la fiche. Les coefficients de température se lisent dans le tableau « caractéristiques thermiques » et sont souvent négatifs (ex. -0.275 %/°C pour Voc).'
            : 'Les tensions et courants DC se lisent dans la partie « Entrée (DC) » de la fiche, les valeurs AC dans la partie « Sortie (AC) ». Les puissances sont en W (et VA pour la puissance apparente), pas en kW : 5 kW = 5000 W.'}
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">{children}</div>
      </Card>
      <Card as="section">
        <h2>Fiche technique</h2>
        <p className="text-[0.8rem] font-normal text-app-muted">Les deux éléments ci-dessous sont obligatoires : le fichier PDF de la fiche <strong>et</strong> son lien sur le site du fabricant.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Fiche technique : fichier PDF (obligatoire)
            <Input type="file" name="datasheet" accept="application/pdf" required />
          </Label>
          <Label>
            Fiche technique : lien sur le site du fabricant (obligatoire)
            <Input type="url" name="datasheetSourceUrl" placeholder="https://" maxLength={500} required />
          </Label>
        </div>
      </Card>
      {state?.error && <p role="alert">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Envoi…' : 'Proposer ce produit'}
        </Button>
        <Link href="/fournisseur/produits" className={buttonVariants({ variant: 'secondary' })}>
          Annuler
        </Link>
      </div>
    </form>
  );
}
