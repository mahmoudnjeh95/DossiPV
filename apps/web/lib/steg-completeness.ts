import { CLIENT_NAME_PLACEHOLDER } from './client-identity';
import { toIsoDate, type ProjectForEngine } from './project-engine-input';

export type StegPieceKey =
  | 'holderName'
  | 'stegContract'
  | 'lastPaidBill'
  | 'installerAccreditation'
  | 'installerTaxId'
  | 'syndicAuthorization'
  | 'structureAttestation'
  | 'moduleAcceptance'
  | 'datasheets'
  | 'mapPoints';

export interface StegPiece {
  key: StegPieceKey;
  label: string;
  done: boolean;
  detail: string | null;
}

/** The pieces the installer can add from the summary screen, one photo or PDF each. */
export const UPLOADABLE_STEG_PIECES = [
  'stegContract',
  'lastPaidBill',
  'syndicAuthorization',
  'structureAttestation',
  'moduleAcceptance',
] as const satisfies readonly StegPieceKey[];

export type UploadableStegPiece = (typeof UPLOADABLE_STEG_PIECES)[number];

export function isUploadableStegPiece(value: unknown): value is UploadableStegPiece {
  return typeof value === 'string' && (UPLOADABLE_STEG_PIECES as readonly string[]).includes(value);
}

/** Why a bill-flow project cannot be generated yet (its proposal's cable lengths and earthing are defaults). */
export const LOCATIONS_PENDING_MESSAGE =
  'Les longueurs de câble et la mise à la terre ne sont pas encore confirmées : placez les points sur la carte avant de générer.';

/**
 * True while a bill-flow project has no confirmed points: applying a proposal resets the cable
 * lengths and the earthing to defaults, and only saving the locations (flowStep READY) replaces
 * them with the real ones. A manually created project (no flowStep) has its lengths typed in.
 */
export function locationsPending(flowStep: ProjectForEngine['flowStep']): boolean {
  return flowStep === 'PROPOSALS' || flowStep === 'LOCATIONS';
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' });

interface DatasheetItem {
  brand: string;
  model: string;
  datasheetFileId: string | null;
}

/** `brand model` of every chosen item that has no stored datasheet, each once. */
function itemsWithoutDatasheet(project: ProjectForEngine): string[] {
  const protections = project.protections;
  const items: (DatasheetItem | null | undefined)[] = [
    project.arrayConfig?.module,
    ...(project.arrayConfig?.inverters.map((entry) => entry.inverter) ?? []),
    protections?.dcSpd,
    protections?.dcSwitch,
    protections?.dcFuse,
    protections?.acBreaker,
    protections?.acSpd,
    protections?.acIsolator,
    ...project.cableRuns.map((run) => run.cable),
    project.earthing?.earthCable,
    project.cablingConfig?.connector,
    project.cablingConfig?.cableTray,
    project.earthing?.distributionBlock,
  ];
  const names = items.flatMap((item) => (item && !item.datasheetFileId ? [`${item.brand} ${item.model}`.trim()] : []));
  return [...new Set(names)];
}

function missingMapPoints(project: ProjectForEngine): string[] {
  const site = project.site;
  const missing: string[] = [];
  if (site?.installationPointLat == null || site.installationPointLon == null) missing.push('Champ PV');
  if (site?.technicalRoomPointLat == null || site.technicalRoomPointLon == null) missing.push('Local technique (onduleur)');
  if (site?.meterPointLat == null || site.meterPointLon == null) missing.push('Compteur STEG');
  return missing;
}

/**
 * The papers a STEG reviewer expects in the dossier, in the order the summary screen lists them,
 * each with whether the project already has it. A missing piece never blocks the generation: the
 * dossier is then a watermarked draft that lists `missingLabels`.
 */
export function stegCompleteness(
  project: ProjectForEngine,
  dossierDate: Date,
  hasAnmeList: boolean,
): { pieces: StegPiece[]; missingLabels: string[] } {
  const annexes = project.annexes;
  const company = project.company;
  const fullName = project.client?.fullName.trim() ?? '';
  const module = project.arrayConfig?.module;

  const accreditationUploaded = company.anmeCertificateFileId !== null;
  const accreditationValid = toIsoDate(company.anmeValidTo) >= toIsoDate(dossierDate);
  const withoutDatasheet = itemsWithoutDatasheet(project);
  const pointsMissing = missingMapPoints(project);

  const pieces: StegPiece[] = [
    {
      key: 'holderName',
      label: 'Nom du titulaire du contrat',
      done: fullName !== '' && fullName !== CLIENT_NAME_PLACEHOLDER,
      detail: null,
    },
    {
      key: 'stegContract',
      label: "Contrat STEG ou attestation d'abonnement",
      done: Boolean(annexes?.stegContractFileId),
      detail: null,
    },
    {
      key: 'lastPaidBill',
      label: 'Dernière facture STEG acquittée',
      done: Boolean(annexes?.lastPaidBillFileId),
      detail: 'Photo ou scan de la facture papier portant la mention « payée », ou reçu de paiement.',
    },
    {
      key: 'installerAccreditation',
      label: "Agrément ANME de l'installateur en cours de validité",
      done: accreditationUploaded && accreditationValid,
      detail: !accreditationUploaded
        ? "Ajoutez l'attestation d'agrément dans Paramètres."
        : accreditationValid
          ? null
          : `Agrément expiré le ${dateFormat.format(company.anmeValidTo)} : mettez-le à jour dans Paramètres.`,
    },
    {
      key: 'installerTaxId',
      label: "Matricule fiscal de l'installateur",
      done: Boolean(company.taxId?.trim()),
      detail: company.taxId?.trim() ? null : 'À saisir dans Paramètres.',
    },
    ...(project.site?.buildingType === 'APARTMENT_BUILDING'
      ? [
          {
            key: 'syndicAuthorization' as const,
            label: 'Autorisation du syndic ou des copropriétaires',
            done: Boolean(annexes?.syndicAuthorizationFileId),
            detail: null,
          },
        ]
      : []),
    {
      key: 'structureAttestation',
      label: 'Attestation de conformité de la structure (bureau de contrôle)',
      done: Boolean(project.structure?.structureAttestationFileId),
      detail: null,
    },
    {
      key: 'moduleAcceptance',
      label: 'Acceptation ANME du module',
      done: Boolean(annexes?.moduleAcceptanceFileId) || Boolean(module?.homologationFileId) || hasAnmeList,
      detail: null,
    },
    {
      key: 'datasheets',
      label: 'Fiches techniques de tous les équipements',
      done: withoutDatasheet.length === 0,
      detail: withoutDatasheet.length === 0 ? null : `Fiche technique manquante : ${withoutDatasheet.join(', ')}.`,
    },
    {
      key: 'mapPoints',
      label: "Points GPS du plan d'implantation",
      done: pointsMissing.length === 0,
      detail: pointsMissing.length === 0 ? null : `Points à placer : ${pointsMissing.join(', ')}.`,
    },
  ];

  return { pieces, missingLabels: pieces.filter((piece) => !piece.done).map((piece) => piece.label) };
}
