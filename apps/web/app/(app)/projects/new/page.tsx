'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { importStegBillAction, type ImportBillState } from '../import-bill-actions';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewProjectPage(): React.JSX.Element {
  const [state, formAction, pending] = useActionState<ImportBillState | undefined, FormData>(
    importStegBillAction,
    undefined,
  );

  return (
    <main>
      <p className="mb-2 text-[0.9rem] [&_a]:no-underline">
        <Link href="/projects">Projets</Link> › Nouveau projet
      </p>
      <h1>Nouveau projet</h1>
      <Card as="form" action={formAction} className="flex flex-col gap-3">
        <p className="text-app-muted">
          Importez la photo ou le PDF de la facture STEG du client : le dossier se prépare automatiquement. Photographiez la dernière facture payée (papier), avec le nom du titulaire.
        </p>
        <Label>
          Facture STEG
          <Input type="file" name="bill" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        </Label>
        {state?.error && <p role="alert">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Lecture de la facture… (environ 30 s)' : 'Lire la facture'}
          </Button>
          <Link href="/projects/new/manual" className={buttonVariants({ variant: 'secondary' })}>
            Créer un projet sans facture
          </Link>
        </div>
      </Card>
    </main>
  );
}
