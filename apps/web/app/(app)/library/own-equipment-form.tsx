'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import type { OwnEquipmentActionState } from './own-equipment-actions';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AttachedDocuments {
  datasheet: boolean;
  homologation: boolean;
}

/**
 * The installer's own equipment form: the type's shared fields (`children`), its two documents
 * and, on creation, its purchase price.
 */
export function OwnEquipmentForm({
  action,
  attached,
  children,
}: {
  action: (prev: OwnEquipmentActionState, formData: FormData) => Promise<OwnEquipmentActionState>;
  /** Present when editing an existing item. */
  attached?: AttachedDocuments | undefined;
  children: ReactNode;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<OwnEquipmentActionState, FormData>(action, undefined);
  const editing = attached !== undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Card as="section">
        <h2>Caractéristiques</h2>
        <p className="text-[0.8rem] font-normal text-app-muted">
          Reprenez les valeurs de la fiche technique du fabricant : elles servent aux vérifications et aux calculs, et figurent
          dans le dossier.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">{children}</div>
      </Card>
      <Card as="section">
        <h2>{editing ? 'Documents' : 'Documents et prix'}</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            {editing ? 'Remplacer la fiche technique (PDF)' : 'Fiche technique (PDF)'}
            <Input type="file" name="datasheet" accept="application/pdf" />
            <span className="text-[0.8rem] font-normal text-app-muted">
              {attached?.datasheet ? 'Une fiche technique est déjà jointe.' : 'Jointe en annexe du dossier STEG.'}
            </span>
          </Label>
          <Label>
            {editing ? "Remplacer l'attestation d'homologation (PDF)" : "Attestation d'homologation (PDF)"}
            <Input type="file" name="homologationDocument" accept="application/pdf" />
            {attached?.homologation && <span className="text-[0.8rem] font-normal text-app-muted">Une attestation est déjà jointe.</span>}
          </Label>
          {!editing && (
            <Label>
              Prix d&apos;achat (DT, optionnel)
              <Input type="number" name="price" min={0} max={1000000} step="0.001" defaultValue={0} />
            </Label>
          )}
        </div>
      </Card>
      {state?.error && <p role="alert">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Link href="/library" className={buttonVariants({ variant: 'secondary' })}>
          Annuler
        </Link>
      </div>
    </form>
  );
}
