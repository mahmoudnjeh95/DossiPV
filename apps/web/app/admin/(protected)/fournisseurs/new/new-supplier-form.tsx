'use client';

import { useActionState } from 'react';
import { createSupplierAction } from '../actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewSupplierForm({ plans }: { plans: { id: string; label: string }[] }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createSupplierAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Card as="fieldset">
        <legend>Société</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Raison sociale
            <Input type="text" name="name" required maxLength={200} />
          </Label>
          <Label>
            Nom du contact
            <Input type="text" name="contactName" required maxLength={200} />
          </Label>
          <Label>
            Email de contact
            <Input type="email" name="email" required maxLength={200} />
          </Label>
          <Label>
            Téléphone
            <Input type="tel" name="phone" required maxLength={30} />
          </Label>
        </div>
      </Card>

      <Card as="fieldset">
        <legend>Compte du responsable</legend>
        <p className="text-[0.8rem] font-normal text-app-muted">Le contact est le responsable du compte fournisseur.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Email de connexion
            <Input type="email" name="ownerEmail" required maxLength={200} />
          </Label>
          <Label>
            Mot de passe
            <Input type="text" name="ownerPassword" required minLength={10} maxLength={72} autoComplete="off" />
            <span className="text-[0.8rem] font-normal text-app-muted">10 caractères minimum. Communiquez-le directement au fournisseur.</span>
          </Label>
        </div>
      </Card>

      <Card as="fieldset">
        <legend>Pack (facultatif)</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Pack
            <Select name="planId" defaultValue="">
              <option value="">Aucun pour l&apos;instant</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Fin de période
            <Input type="date" name="periodEnd" />
            <span className="text-[0.8rem] font-normal text-app-muted">Obligatoire si un pack est choisi.</span>
          </Label>
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        Créer le fournisseur
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
