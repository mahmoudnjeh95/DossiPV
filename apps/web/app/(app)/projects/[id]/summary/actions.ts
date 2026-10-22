'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnedProject, ProjectNotFoundError } from '../../../../../lib/project-access';
import { storeAnnexFiles, storeStructureAttestation } from '../../../../../lib/annex-upload';
import { isUploadableStegPiece } from '../../../../../lib/steg-completeness';

export interface PieceUploadState {
  error: string;
}

/**
 * Adds one STEG piece (a photo or a PDF) from the summary screen. The project papers go through
 * `storeAnnexFiles` (type and size checked before anything is written); the structure attestation
 * is stored on the project's structure row. Nothing about the file is logged.
 */
export async function uploadStegPieceAction(
  projectId: string,
  // useActionState passes the previous state.
  _prev: PieceUploadState | undefined,
  formData: FormData,
): Promise<PieceUploadState | undefined> {
  try {
    await requireOwnedProject(projectId);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) return { error: 'Projet introuvable.' };
    throw error;
  }

  const piece = formData.get('piece');
  if (!isUploadableStegPiece(piece)) return { error: 'Pièce inconnue.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choisissez une photo ou un fichier PDF.' };

  let result: { error: string } | null;
  if (piece === 'structureAttestation') {
    result = await storeStructureAttestation(projectId, file);
  } else {
    // Only this piece's file reaches the annex store, under its own field name.
    const upload = new FormData();
    upload.append(piece, file);
    result = await storeAnnexFiles(projectId, upload);
  }
  if (result) return result;

  revalidatePath(`/projects/${projectId}/summary`);
  return undefined;
}
