'use server';

import { redirect } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../layout';
import { FormReader } from '../../../lib/form-reader';
import { CIVILITY_OPTIONS, CLIENT_KIND_OPTIONS } from '../../../lib/labels';
import { companyProjectTier } from '../../../lib/subscription';

export interface CreateProjectActionState {
  error: string;
}

/**
 * Creates a DRAFT project for the caller's company. The tier comes from the company's current
 * plan (spec §1: Premium unlocks the map-based pages 37–38), never from the form, so a client
 * cannot grant itself Premium by editing a hidden field.
 */
export async function createProjectAction(
  _prevState: CreateProjectActionState | undefined,
  formData: FormData,
): Promise<CreateProjectActionState | undefined> {
  const user = await requireAuthenticatedCompanyUser();

  const reader = new FormReader(formData);
  const fullName = reader.text('fullName', 'Nom du client', 200);
  const civility = reader.optionalOneOf(
    'civility',
    'Civilité',
    CIVILITY_OPTIONS.map((o) => o.value),
  );
  const clientKind = reader.oneOf(
    'clientKind',
    'Type de client',
    CLIENT_KIND_OPTIONS.map((o) => o.value),
  );
  const stegReference = reader.optionalText('stegReference', 'Référence STEG', 100);

  if (reader.hasErrors) {
    return { error: reader.errorMessage() };
  }

  const tier = await companyProjectTier(user.companyId);

  const project = await db.project.create({
    data: {
      companyId: user.companyId,
      tier,
      status: 'DRAFT',
      client: { create: { fullName, civility, clientKind, stegReference } },
    },
  });

  redirect(`/projects/${project.id}`);
  return undefined;
}
