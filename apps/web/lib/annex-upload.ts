import { db } from '@dossipv/db';
import { saveFile, deleteFile, validateUploadedFile } from '@dossipv/file-storage';

interface UploadSuccess {
  storageKey: string;
  mimeType: string;
  fileName: string;
}

interface ValidatedFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export const ANNEX_FIELDS = ['cin', 'commercialRegister', 'stegContract', 'lastPaidBill', 'moduleAcceptance', 'syndicAuthorization'] as const;
const ANNEX_FILE_ID_KEYS = {
  cin: 'cinFileId',
  commercialRegister: 'commercialRegisterFileId',
  stegContract: 'stegContractFileId',
  lastPaidBill: 'lastPaidBillFileId',
  moduleAcceptance: 'moduleAcceptanceFileId',
  syndicAuthorization: 'syndicAuthorizationFileId',
} as const;

/** Reads and validates a field's file (if present) without writing anything to disk yet. */
async function validateFileField(formData: FormData, fieldName: string): Promise<ValidatedFile | null | { error: string }> {
  // getAll: the CIN photo and the CIN number share the field name `cin` on the identity form.
  const field = formData.getAll(fieldName).find((v): v is File => v instanceof File);
  if (!field || field.size === 0) {
    return null;
  }
  const buffer = Buffer.from(await field.arrayBuffer());
  const validation = validateUploadedFile(buffer, field.type, field.size);
  if (!validation.valid) {
    return { error: validation.error };
  }
  return { buffer, mimeType: validation.mimeType, fileName: field.name };
}

async function saveValidatedFile(validated: ValidatedFile): Promise<UploadSuccess> {
  const { storageKey } = await saveFile(validated.buffer, validated.fileName, validated.mimeType);
  return { storageKey, mimeType: validated.mimeType, fileName: validated.fileName };
}

/**
 * Stores the annex files of a form (named fields plus repeatable extras) on a project the caller
 * has already authorised. Every file is validated before anything is written; replaced files are
 * deleted afterwards, except those a ProjectBillImport still references. The caller owns auth.
 */
export async function storeAnnexFiles(projectId: string, formData: FormData): Promise<{ error: string } | null> {
  const existing = await db.projectAnnexes.findUnique({ where: { projectId } });

  // Phase 1: validate every file with no disk writes yet, so a later field's rejection can never
  // orphan an earlier field's already-saved file.
  const validated: Record<(typeof ANNEX_FIELDS)[number], ValidatedFile | null> = {
    cin: null,
    commercialRegister: null,
    stegContract: null,
    lastPaidBill: null,
    moduleAcceptance: null,
    syndicAuthorization: null,
  };
  for (const field of ANNEX_FIELDS) {
    const result = await validateFileField(formData, field);
    if (result && 'error' in result) {
      return { error: result.error };
    }
    validated[field] = result;
  }

  const extraFiles = formData.getAll('extraFiles').filter((f): f is File => f instanceof File && f.size > 0);
  const validatedExtraFiles: ValidatedFile[] = [];
  for (const extraFile of extraFiles) {
    const buffer = Buffer.from(await extraFile.arrayBuffer());
    const validation = validateUploadedFile(buffer, extraFile.type, extraFile.size);
    if (!validation.valid) {
      return { error: validation.error };
    }
    validatedExtraFiles.push({ buffer, mimeType: validation.mimeType, fileName: extraFile.name });
  }

  // Phase 2: every file is known-valid — now it's safe to write to disk and create File rows.
  const newFileIds: Partial<Record<string, string>> = {};
  for (const field of ANNEX_FIELDS) {
    const toSave = validated[field];
    if (toSave) {
      const saved = await saveValidatedFile(toSave);
      const file = await db.file.create({ data: { fileName: saved.fileName, mimeType: saved.mimeType, storageKey: saved.storageKey } });
      newFileIds[ANNEX_FILE_ID_KEYS[field]] = file.id;
    }
  }
  const extraFileUploads: UploadSuccess[] = [];
  for (const toSave of validatedExtraFiles) {
    extraFileUploads.push(await saveValidatedFile(toSave));
  }

  // Phase 3: link everything in one transaction.
  await db.$transaction(async (tx) => {
    const annexes = await tx.projectAnnexes.upsert({
      where: { projectId },
      create: { projectId, ...newFileIds },
      update: newFileIds,
    });

    if (extraFileUploads.length > 0) {
      const extraFileRows = await Promise.all(
        extraFileUploads.map((upload) =>
          tx.file.create({ data: { fileName: upload.fileName, mimeType: upload.mimeType, storageKey: upload.storageKey } }),
        ),
      );
      await tx.projectAnnexExtraFile.deleteMany({ where: { annexesId: annexes.id } });
      await tx.projectAnnexExtraFile.createMany({ data: extraFileRows.map((file) => ({ annexesId: annexes.id, fileId: file.id })) });
    }
  });

  for (const field of ANNEX_FIELDS) {
    const newId = newFileIds[ANNEX_FILE_ID_KEYS[field]];
    const oldId = existing?.[ANNEX_FILE_ID_KEYS[field]];
    if (newId && oldId) {
      const oldFile = await db.file.findUnique({ where: { id: oldId } });
      // A bill-imported project's ProjectBillImport row points at the bill it was read from
      // (ON DELETE RESTRICT): that File and its bytes stay; only the annex is relinked above.
      const keptByBillImport = oldFile ? (await db.projectBillImport.count({ where: { fileId: oldFile.id } })) > 0 : false;
      if (oldFile && !keptByBillImport) {
        await deleteFile(oldFile.storageKey);
        await db.file.delete({ where: { id: oldFile.id } });
      }
    }
  }

  return null;
}

/**
 * Stores the structure's conformity attestation (bureau de contrôle) on the project's structure row
 * and deletes the file it replaces. Refuses before writing anything when the project has no
 * structure yet. The caller owns auth.
 */
export async function storeStructureAttestation(projectId: string, file: File): Promise<{ error: string } | null> {
  const structure = await db.projectStructure.findUnique({ where: { projectId }, select: { structureAttestationFileId: true } });
  if (!structure) {
    return { error: 'Structure non renseignée.' };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateUploadedFile(buffer, file.type, file.size);
  if (!validation.valid) {
    return { error: validation.error };
  }
  const saved = await saveValidatedFile({ buffer, mimeType: validation.mimeType, fileName: file.name });
  const row = await db.file.create({ data: { fileName: saved.fileName, mimeType: saved.mimeType, storageKey: saved.storageKey } });
  await db.projectStructure.update({ where: { projectId }, data: { structureAttestationFileId: row.id } });

  const oldId = structure.structureAttestationFileId;
  if (oldId) {
    const oldFile = await db.file.findUnique({ where: { id: oldId } });
    if (oldFile) {
      await deleteFile(oldFile.storageKey);
      await db.file.delete({ where: { id: oldFile.id } });
    }
  }
  return null;
}
