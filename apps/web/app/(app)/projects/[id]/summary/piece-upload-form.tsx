'use client';

import { useActionState } from 'react';
import { uploadStegPieceAction } from './actions';
import type { UploadableStegPiece } from '../../../../../lib/steg-completeness';

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
      <input type="hidden" name="piece" value={piece} />
      <input
        type="file"
        name="file"
        accept="image/jpeg,image/png,application/pdf"
        required
        aria-label={`${label} : photo ou PDF`}
      />
      <button type="submit" className="small secondary" disabled={pending}>
        {pending ? 'Envoi…' : 'Ajouter la photo'}
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
