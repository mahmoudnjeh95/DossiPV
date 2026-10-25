'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { useKeepFormValues } from '../../../../../lib/keep-form-values';
import { createProjectAction, type CreateProjectActionState } from '../../actions';
import { CIVILITY_OPTIONS, CLIENT_KIND_OPTIONS } from '../../../../../lib/labels';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function NewProjectPage(): React.JSX.Element {
  const { state, formAction, formRef, errorRef } = useKeepFormValues<CreateProjectActionState>(createProjectAction);

  return (
    <main>
      <p className="mb-2 text-[0.9rem] [&_a]:no-underline">
        <Link href="/projects">Projets</Link> › Nouveau projet
      </p>
      <h1>Nouveau projet</h1>
      <Card as="form" ref={formRef} action={formAction} className="flex flex-col gap-3">
        {state?.error && <p ref={errorRef} role="alert">{state.error}</p>}
        <p className="text-app-muted">
          Seul le nom du client est nécessaire pour commencer ; le reste du dossier se complète section par section.
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Civilité
            <Select name="civility" defaultValue="">
              <option value="">—</option>
              {CIVILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Nom complet du client
            <Input type="text" name="fullName" required maxLength={200} />
          </Label>
          <Label>
            Type de client
            <Select name="clientKind" defaultValue="residential">
              {CLIENT_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Référence STEG
            <Input type="text" name="stegReference" maxLength={100} />
            <span className="text-[0.8rem] font-normal text-app-muted">Peut être renseignée plus tard ; verrouillée après la première génération.</span>
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreateButton />
          <Link href="/projects" className={buttonVariants({ variant: 'secondary' })}>
            Annuler
          </Link>
        </div>
      </Card>
    </main>
  );
}

/** Own component so useFormStatus sees the form: the redirect after creation can take a few seconds. */
function CreateButton(): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Création du projet…' : 'Créer le projet'}
    </Button>
  );
}
