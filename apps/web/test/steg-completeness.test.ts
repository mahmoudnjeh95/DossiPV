import { describe, it, expect } from 'vitest';
import { stegCompleteness } from '../lib/steg-completeness';
import type { ProjectForEngine } from '../lib/project-engine-input';
import { buildFullProject } from './fixtures/full-project';

const DOSSIER_DATE = new Date('2026-10-22T09:00:00Z');

function withDatasheets<T extends { datasheetFileId: string | null }>(item: T, id: string): T {
  return { ...item, datasheetFileId: `sheet-${id}` };
}

/** A house project with every STEG piece: papers uploaded, points placed, datasheets stored. */
function completeHouse(): ProjectForEngine {
  const project = buildFullProject();
  const protections = project.protections!;
  const arrayConfig = project.arrayConfig!;
  return {
    ...project,
    client: { ...project.client!, fullName: 'MR TEST CLIENT' },
    company: { ...project.company, taxId: '1234567/A/M/000' },
    site: {
      ...project.site!,
      buildingType: 'HOUSE',
      installationPointLat: 36.56,
      installationPointLon: 10.527,
      technicalRoomPointLat: 36.5601,
      technicalRoomPointLon: 10.5271,
      meterPointLat: 36.5602,
      meterPointLon: 10.5272,
    },
    annexes: {
      id: 'annexes-1',
      projectId: 'project-1',
      cinFileId: 'file-cin',
      commercialRegisterFileId: null,
      stegContractFileId: 'file-contract',
      lastPaidBillFileId: 'file-bill',
      moduleAcceptanceFileId: 'file-acceptance',
      syndicAuthorizationFileId: null,
      extraFiles: [],
    },
    structure: { ...project.structure!, structureAttestationFileId: 'file-structure' },
    arrayConfig: {
      ...arrayConfig,
      module: withDatasheets(arrayConfig.module, 'module'),
      inverters: arrayConfig.inverters.map((entry) => ({ ...entry, inverter: withDatasheets(entry.inverter, 'inverter') })),
    },
    protections: {
      ...protections,
      dcSpd: withDatasheets(protections.dcSpd, 'dc-spd'),
      dcSwitch: withDatasheets(protections.dcSwitch, 'dc-switch'),
      acBreaker: withDatasheets(protections.acBreaker, 'ac-breaker'),
      acSpd: withDatasheets(protections.acSpd, 'ac-spd'),
    },
    cableRuns: project.cableRuns.map((run) => ({ ...run, cable: withDatasheets(run.cable, run.cable.id) })),
    earthing: { ...project.earthing!, earthCable: withDatasheets(project.earthing!.earthCable, 'earth') },
  };
}

describe('stegCompleteness', () => {
  it('finds nothing missing on a complete house project', () => {
    const { pieces, missingLabels } = stegCompleteness(completeHouse(), DOSSIER_DATE, false);

    expect(missingLabels).toEqual([]);
    expect(pieces.map((piece) => piece.key)).toEqual([
      'holderName',
      'stegContract',
      'lastPaidBill',
      'installerAccreditation',
      'installerTaxId',
      'structureAttestation',
      'moduleAcceptance',
      'datasheets',
      'mapPoints',
    ]);
    expect(pieces.find((piece) => piece.key === 'lastPaidBill')?.detail).toBe(
      'Photo ou scan de la facture papier portant la mention « payée », ou reçu de paiement.',
    );
  });

  it('lists the syndic authorization for a flat, never for a house', () => {
    const house = completeHouse();
    const flat = { ...house, site: { ...house.site!, buildingType: 'APARTMENT_BUILDING' as const } };

    expect(stegCompleteness(flat, DOSSIER_DATE, false).missingLabels).toEqual(['Autorisation du syndic ou des copropriétaires']);
    expect(stegCompleteness(house, DOSSIER_DATE, false).pieces.some((piece) => piece.key === 'syndicAuthorization')).toBe(false);

    const authorized = { ...flat, annexes: { ...flat.annexes!, syndicAuthorizationFileId: 'file-syndic' } };
    const { pieces, missingLabels } = stegCompleteness(authorized, DOSSIER_DATE, false);
    expect(missingLabels).toEqual([]);
    // Listed right after the installer's papers.
    expect(pieces.map((piece) => piece.key).indexOf('syndicAuthorization')).toBe(5);
  });

  it('counts an expired ANME agreement as missing', () => {
    const project = completeHouse();
    const expired = { ...project, company: { ...project.company, anmeValidTo: new Date('2026-10-21T00:00:00Z') } };

    const { pieces, missingLabels } = stegCompleteness(expired, DOSSIER_DATE, false);

    expect(missingLabels).toEqual(["Agrément ANME de l'installateur en cours de validité"]);
    expect(pieces.find((piece) => piece.key === 'installerAccreditation')?.detail).toBe(
      'Agrément expiré le 21/10/2026 : mettez-le à jour dans Paramètres.',
    );
    // Valid through the dossier day itself.
    const lastDay = { ...project, company: { ...project.company, anmeValidTo: new Date('2026-10-22T00:00:00Z') } };
    expect(stegCompleteness(lastDay, DOSSIER_DATE, false).missingLabels).toEqual([]);
  });

  it('names the item whose datasheet is missing', () => {
    const project = completeHouse();
    const protections = project.protections!;
    const noSheet = { ...project, protections: { ...protections, acSpd: { ...protections.acSpd, datasheetFileId: null } } };

    const { pieces, missingLabels } = stegCompleteness(noSheet, DOSSIER_DATE, false);

    expect(missingLabels).toEqual(['Fiches techniques de tous les équipements']);
    expect(pieces.find((piece) => piece.key === 'datasheets')?.detail).toBe('Fiche technique manquante : Generic AC-SPD-1.');
  });

  it('accepts the stored ANME list as the module acceptance', () => {
    const project = completeHouse();
    const noLetter = { ...project, annexes: { ...project.annexes!, moduleAcceptanceFileId: null } };

    expect(stegCompleteness(noLetter, DOSSIER_DATE, false).missingLabels).toEqual(['Acceptation ANME du module']);
    expect(stegCompleteness(noLetter, DOSSIER_DATE, true).missingLabels).toEqual([]);
  });

  it('flags the placeholder holder name, missing papers and unplaced points', () => {
    const project = buildFullProject();
    const bare = { ...project, client: { ...project.client!, fullName: 'Client à compléter' } };

    const { pieces, missingLabels } = stegCompleteness(bare, DOSSIER_DATE, false);

    expect(missingLabels).toEqual([
      'Nom du titulaire du contrat',
      "Contrat STEG ou attestation d'abonnement",
      'Dernière facture STEG acquittée',
      "Matricule fiscal de l'installateur",
      'Attestation de conformité de la structure (bureau de contrôle)',
      'Acceptation ANME du module',
      'Fiches techniques de tous les équipements',
      "Points GPS du plan d'implantation",
    ]);
    expect(pieces.find((piece) => piece.key === 'mapPoints')?.detail).toBe(
      'Points à placer : Champ PV, Local technique (onduleur), Compteur STEG.',
    );
  });
});
