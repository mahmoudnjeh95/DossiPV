'use client';

import { useActionState } from 'react';
import { updateP2pSettingsAction } from './actions';
import type { P2pFormValues } from './p2p-validation';

export function P2pForm({ values }: { values: P2pFormValues }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(updateP2pSettingsAction, undefined);

  return (
    <form action={formAction}>
      <label>
        Titulaire du compte (nom affiché au client)
        <input type="text" name="p2pAccountHolder" defaultValue={values.p2pAccountHolder} maxLength={100} />
      </label>
      <label>
        Numéro Flouci
        <input type="tel" name="p2pFlouciNumber" defaultValue={values.p2pFlouciNumber} maxLength={20} />
      </label>
      <label>
        Numéro izi
        <input type="tel" name="p2pIziNumber" defaultValue={values.p2pIziNumber} maxLength={20} />
      </label>
      <label>
        Numéro D17
        <input type="tel" name="p2pD17Number" defaultValue={values.p2pD17Number} maxLength={20} />
      </label>
      <label>
        Instructions affichées au client
        <textarea name="p2pInstructions" defaultValue={values.p2pInstructions} maxLength={1000} rows={3} />
      </label>
      <button type="submit" disabled={pending}>
        Enregistrer
      </button>
      {state?.saved && <p role="status">Paramètres de paiement enregistrés.</p>}
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
