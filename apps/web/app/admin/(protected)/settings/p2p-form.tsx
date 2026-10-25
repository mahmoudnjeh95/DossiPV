'use client';

import { useActionState } from 'react';
import { updateP2pSettingsAction } from './actions';
import type { P2pFormValues } from './p2p-validation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function P2pForm({ values }: { values: P2pFormValues }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(updateP2pSettingsAction, undefined);

  return (
    <form action={formAction}>
      <Label>
        Titulaire du compte (nom affiché au client)
        <Input type="text" name="p2pAccountHolder" defaultValue={values.p2pAccountHolder} maxLength={100} />
      </Label>
      <Label>
        Numéro Flouci
        <Input type="tel" name="p2pFlouciNumber" defaultValue={values.p2pFlouciNumber} maxLength={20} />
      </Label>
      <Label>
        Numéro izi
        <Input type="tel" name="p2pIziNumber" defaultValue={values.p2pIziNumber} maxLength={20} />
      </Label>
      <Label>
        Numéro D17
        <Input type="tel" name="p2pD17Number" defaultValue={values.p2pD17Number} maxLength={20} />
      </Label>
      <Label>
        Instructions affichées au client
        <Textarea name="p2pInstructions" defaultValue={values.p2pInstructions} maxLength={1000} rows={3} />
      </Label>
      <Button type="submit" disabled={pending}>
        Enregistrer
      </Button>
      {state?.saved && <p role="status">Paramètres de paiement enregistrés.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
