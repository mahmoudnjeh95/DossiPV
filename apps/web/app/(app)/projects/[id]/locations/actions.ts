'use server';

import { db } from '@dossipv/db';
import { computeRunLengthsM, groundDistanceM, runEngine, type EngineResult, type GpsPoint } from '@dossipv/engine';
import { requireOwnedProject, ProjectNotFoundError } from '../../../../../lib/project-access';
import { PROJECT_ENGINE_INCLUDE, buildEngineInput, type ProjectForEngine } from '../../../../../lib/project-engine-input';
import { generateDossierAction } from '../actions';

const NOT_FOUND = 'Projet introuvable.';
const MAX_POINT_SPREAD_M = 500;
const MAX_FLOORS = 3;

export interface LocationsPayload {
  field: GpsPoint | null;
  technicalRoom: GpsPoint | null;
  meter: GpsPoint | null;
  earthPit: GpsPoint | null;
  floors: number;
}

const REQUIRED_POINTS = [
  { key: 'field', label: 'Champ PV' },
  { key: 'technicalRoom', label: 'Local technique (onduleur)' },
  { key: 'meter', label: 'Compteur STEG' },
] as const;

function isValidPoint(point: GpsPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

function validate(payload: LocationsPayload): string | null {
  for (const { key, label } of REQUIRED_POINTS) {
    if (!payload[key]) return `Placez le point « ${label} » sur la carte.`;
  }
  const placed = [payload.field, payload.technicalRoom, payload.meter, payload.earthPit].filter(
    (point): point is GpsPoint => point !== null,
  );
  if (!placed.every(isValidPoint)) return 'Coordonnées invalides.';
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) {
      if (groundDistanceM(a, b) > MAX_POINT_SPREAD_M) {
        return `Les points sont trop éloignés (plus de ${MAX_POINT_SPREAD_M} m) : vérifiez leur emplacement.`;
      }
    }
  }
  if (!Number.isInteger(payload.floors) || payload.floors < 0 || payload.floors > MAX_FLOORS) {
    return 'Niveau du toit invalide.';
  }
  return null;
}

type Circuit = 'DC' | 'AC';

/** Does this circuit's cable carry its current (C16 / C13) within the voltage-drop limit? */
function circuitFits(result: EngineResult, circuit: Circuit, maxDropPct: number): boolean {
  const checkId = circuit === 'DC' ? 'C16' : 'C13';
  const dropPct = result.derived[circuit === 'DC' ? 'DU_DC_PCT' : 'DU_AC_PCT'];
  const carriesCurrent = result.checks.filter((check) => check.id === checkId).every((check) => check.pass);
  return carriesCurrent && (dropPct === undefined || dropPct <= maxDropPct);
}

/**
 * The installer placed the points: save them, derive the DC/AC run lengths, bump a run to the
 * cable's next larger section while its current-carrying check or voltage drop fails with the new
 * length, then enqueue the dossier like the regular "Générer" button does.
 */
export async function saveLocationsAndGenerateAction(
  projectId: string,
  payload: LocationsPayload,
): Promise<{ error: string } | undefined> {
  let owned: Awaited<ReturnType<typeof requireOwnedProject>>;
  try {
    owned = await requireOwnedProject(projectId);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) return { error: NOT_FOUND };
    throw error;
  }

  const invalid = validate(payload);
  if (invalid) return { error: invalid };
  const { field, technicalRoom, meter, earthPit, floors } = payload;
  if (!field || !technicalRoom || !meter) return { error: 'Points manquants.' };

  const lengths = computeRunLengthsM({ field, technicalRoom, meter }, floors);

  await db.projectSite.update({
    where: { projectId },
    data: {
      gpsLat: field.lat,
      gpsLon: field.lon,
      installationPointLat: field.lat,
      installationPointLon: field.lon,
      technicalRoomPointLat: technicalRoom.lat,
      technicalRoomPointLon: technicalRoom.lon,
      meterPointLat: meter.lat,
      meterPointLon: meter.lon,
      earthPitPointLat: earthPit?.lat ?? null,
      earthPitPointLon: earthPit?.lon ?? null,
      floors,
    },
  });
  await db.projectCableRun.updateMany({ where: { projectId, circuitType: 'DC' }, data: { lengthM: lengths.dcLengthM } });
  await db.projectCableRun.updateMany({ where: { projectId, circuitType: 'AC' }, data: { lengthM: lengths.acLengthM } });

  const loaded = await db.project.findFirst({
    where: { id: owned.id, companyId: owned.companyId },
    include: PROJECT_ENGINE_INCLUDE,
  });
  if (!loaded) return { error: NOT_FOUND };
  let project: ProjectForEngine = loaded;
  const now = new Date();

  for (const circuit of ['DC', 'AC'] as const) {
    const lengthM = circuit === 'DC' ? lengths.dcLengthM : lengths.acLengthM;
    for (;;) {
      const built = buildEngineInput(project, now);
      if (!built.ok) return { error: `Dossier incomplet : ${built.missing.join(' ')}` };
      let result: EngineResult;
      try {
        result = runEngine(built.input);
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Erreur de calcul.' };
      }
      if (circuitFits(result, circuit, built.input.maxVoltageDropPct)) break;

      const run = project.cableRuns.find((candidate) => candidate.circuitType === circuit);
      const larger = run?.cable.sections
        .filter((section) => section.sectionMm2 > run.sectionMm2)
        .sort((a, b) => a.sectionMm2 - b.sectionMm2)[0];
      if (!run || !larger) {
        return { error: `Aucune section de câble ne respecte la chute de tension pour la liaison ${circuit} (${lengthM} m).` };
      }
      await db.projectCableRun.updateMany({
        where: { projectId, circuitType: circuit },
        data: { sectionMm2: larger.sectionMm2 },
      });
      project = {
        ...project,
        cableRuns: project.cableRuns.map((candidate) =>
          candidate.id === run.id ? { ...candidate, sectionMm2: larger.sectionMm2 } : candidate,
        ),
      };
    }
  }

  await db.project.update({ where: { id: projectId }, data: { flowStep: 'READY' } });
  return generateDossierAction(projectId, undefined);
}
