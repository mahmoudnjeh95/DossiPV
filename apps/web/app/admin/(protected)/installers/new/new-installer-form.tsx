'use client';

import { useActionState } from 'react';
import { createInstallerAction } from '../actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewInstallerForm({ plans }: { plans: { id: string; label: string }[] }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(createInstallerAction, undefined);

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
            Adresse
            <Input type="text" name="address" required maxLength={300} />
          </Label>
          <Label>
            Téléphone
            <Input type="tel" name="phone" required maxLength={30} />
          </Label>
          <Label>
            Email de contact
            <Input type="email" name="email" required maxLength={200} />
          </Label>
          <Label>
            Représentant légal
            <Input type="text" name="legalRepFullName" required maxLength={200} />
          </Label>
        </div>
      </Card>

      <Card as="fieldset">
        <legend>Accréditation ANME</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Code ANME
            <Input type="text" name="anmeCode" required maxLength={50} />
          </Label>
          <Label>
            Catégorie
            <Select name="anmeCategory" defaultValue="BT">
              <option value="BT">BT</option>
              <option value="MT">MT</option>
              <option value="BT_MT">BT + MT</option>
            </Select>
          </Label>
          <Label>
            Valide du
            <Input type="date" name="anmeValidFrom" required />
          </Label>
          <Label>
            Valide jusqu&apos;au
            <Input type="date" name="anmeValidTo" required />
          </Label>
        </div>
      </Card>

      <Card as="fieldset">
        <legend>Compte du responsable</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Nom complet
            <Input type="text" name="ownerFullName" required maxLength={200} />
          </Label>
          <Label>
            Email de connexion
            <Input type="email" name="ownerEmail" required maxLength={200} />
          </Label>
          <Label>
            Mot de passe
            <Input type="text" name="ownerPassword" required minLength={10} maxLength={72} autoComplete="off" />
            <span className="text-[0.8rem] font-normal text-app-muted">10 caractères minimum. Communiquez-le directement à l&apos;installateur.</span>
          </Label>
        </div>
      </Card>

      <Card as="fieldset">
        <legend>Abonnement (facultatif)</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Plan
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
            <span className="text-[0.8rem] font-normal text-app-muted">Obligatoire si un plan est choisi.</span>
          </Label>
        </div>
      </Card>

      <Button type="submit" disabled={pending}>
        Créer l&apos;installateur
      </Button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
