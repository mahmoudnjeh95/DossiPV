'use client';

import { useActionState } from 'react';
import { uploadStegPieceAction } from './actions';
import type { UploadableStegPiece } from '../../../../../lib/steg-completeness';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';

interface PieceUploadFormProps {
  projectId: string;
  piece: UploadableStegPiece;
  /** The piece's name, read out with the file field. */
  label: string;
}

/** One photo or PDF for one STEG piece; the summary refreshes once it is stored. */
export function PieceUploadForm({ projectId, piece, label }: PieceUploadFormProps): React.JSX.Element {
  const bound = uploadStegPieceAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(bound, undefined);
  return (
    <form action={formAction} className="piece-upload">
      <Input type="hidden" name="piece" value={piece} />
      <Input
        type="file"
        name="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        required
        aria-label={`${label} : photo ou PDF`}
      />
      <Button variant="secondary" size="sm" type="submit"  disabled={pending}>
        {pending ? 'Envoi…' : 'Ajouter la photo'}
      </Button>
      {state?.error && <Alert variant="danger" role="alert">{state.error}</Alert>}
      {state?.saved && <p role="status">Fichier enregistré ✓</p>}
    </form>
  );
}
