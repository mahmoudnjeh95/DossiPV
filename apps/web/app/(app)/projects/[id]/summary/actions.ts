'use server';

import { revalidatePath } from 'next/cache';
import sharp from 'sharp';
import { requireOwnedProject, ProjectNotFoundError } from '../../../../../lib/project-access';
import { storeAnnexFiles, storeStructureAttestation } from '../../../../../lib/annex-upload';
import { isUploadableStegPiece } from '../../../../../lib/steg-completeness';

export interface PieceUploadState {
  error?: string;
  /** Set after a successful upload, so the form can say so. */
  saved?: true;
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

  // pdf-lib (the dossier assembly) cannot embed WebP: store it as JPEG. HEIC is not readable here.
  let upload = file;
  if (file.type === 'image/webp') {
    try {
      const jpeg = await sharp(Buffer.from(await file.arrayBuffer())).jpeg({ quality: 90 }).toBuffer();
      upload = new File([new Uint8Array(jpeg)], file.name.replace(/.webp$/i, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
      return { error: "Image illisible : choisissez une photo JPEG, PNG ou un PDF." };
    }
  } else if (file.type === 'image/heic' || file.type === 'image/heif' || /.hei[cf]$/i.test(file.name)) {
    return { error: 'Format HEIC non pris en charge : réglez l’appareil photo sur JPEG ou choisissez un PDF.' };
  }

  let result: { error: string } | null;
  if (piece === 'structureAttestation') {
    result = await storeStructureAttestation(projectId, upload);
  } else {
    // Only this piece's file reaches the annex store, under its own field name.
    const form = new FormData();
    form.append(piece, upload);
    result = await storeAnnexFiles(projectId, form);
  }
  if (result) return result;

  revalidatePath(`/projects/${projectId}/summary`);
  return { saved: true };
}
