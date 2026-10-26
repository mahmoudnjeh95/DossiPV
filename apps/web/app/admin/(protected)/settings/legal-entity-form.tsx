'use client';

import { useActionState } from 'react';
import { updateLegalEntityAction } from './actions';
import type { LegalEntityFormValues } from './legal-entity-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELDS: ReadonlyArray<{ name: keyof LegalEntityFormValues; label: string; maxLength: number; placeholder?: string }> = [
  { name: 'legalName', label: 'Raison sociale', maxLength: 200 },
  { name: 'legalForm', label: 'Forme juridique et capital', maxLength: 200, placeholder: 'ex. SARL au capital de 10 000 TND' },
  { name: 'legalRneId', label: 'Identifiant RNE', maxLength: 50 },
  { name: 'legalTaxId', label: 'Matricule fiscal', maxLength: 50 },
  { name: 'legalAddress', label: 'Siège', maxLength: 300 },
  { name: 'legalPublisher', label: 'Directeur de la publication', maxLength: 200, placeholder: 'ex. le gérant' },
  { name: 'legalInpdpDeclaration', label: 'N° de déclaration INPDP', maxLength: 100 },
  { name: 'legalHost', label: 'Hébergeur (nom et adresse)', maxLength: 300, placeholder: 'ex. OVH SAS, 2 rue Kellermann, 59100 Roubaix, France' },
];

export function LegalEntityForm({ values }: { values: LegalEntityFormValues }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(updateLegalEntityAction, undefined);

  return (
    <form action={formAction}>
      {FIELDS.map((field) => (
        <Label key={field.name}>
          {field.label}
          <Input type="text" name={field.name} defaultValue={values[field.name]} maxLength={field.maxLength} placeholder={field.placeholder} />
        </Label>
      ))}
      <Button type="submit" disabled={pending}>
        Enregistrer
      </Button>
      {state?.saved && <p role="status">Société éditrice enregistrée.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
