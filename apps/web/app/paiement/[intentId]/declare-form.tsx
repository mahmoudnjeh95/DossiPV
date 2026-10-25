'use client';

import { useActionState, useState } from 'react';
import { declareIntentAction } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';

/** Screenshot of the transfer (required) and the sender number or transfer reference (required). */
export function DeclareForm({ intentId, reference }: { intentId: string; reference: string }): React.JSX.Element {
  const [state, formAction, pending] = useActionState(declareIntentAction.bind(null, intentId), undefined);
  const [fileName, setFileName] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Label className="gap-2">
        Capture d’écran du transfert
        <span className="flex cursor-pointer flex-col items-center gap-1 rounded-ui border-2 border-dashed border-app-border bg-app-bg px-4 py-6 text-center transition hover:border-app-accent hover:bg-app-accent-soft has-[:focus-visible]:border-app-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[rgba(29,75,151,0.35)]">
          <span aria-hidden="true" className="text-[1.6rem] leading-none">
            📷
          </span>
          <span className="font-semibold">{fileName || 'Touchez pour choisir la capture'}</span>
          <span className="text-[0.8rem] font-normal text-app-muted">PNG, JPEG ou WebP, 8 Mo au plus. Le montant et la date doivent être visibles.</span>
          <input
            type="file"
            name="proof"
            accept="image/png,image/jpeg,image/webp"
            required
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')}
          />
        </span>
      </Label>
      <Label>
        Numéro d’envoi ou référence du transfert
        <Input type="text" name="reference" maxLength={100} required autoComplete="off" placeholder={`Votre numéro ou ${reference}`} />
        <span className="text-[0.8rem] font-normal text-app-muted">Le numéro depuis lequel vous avez envoyé, ou la référence affichée par votre application.</span>
      </Label>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:self-start">
        {pending ? 'Envoi…' : 'J’ai envoyé le paiement'}
      </Button>
      {state?.saved && (
        <Alert variant="ok" role="status">
          Paiement déclaré : en attente de validation par SolarixPro.
        </Alert>
      )}
      {state?.error && (
        <Alert variant="danger" role="alert">
          {state.error}
        </Alert>
      )}
    </form>
  );
}
