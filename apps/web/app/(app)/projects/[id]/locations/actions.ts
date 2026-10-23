'use server';

import { redirect } from 'next/navigation';
import { db, Prisma } from '@dossipv/db';
import {
  computeRunLengthsM,
  groundDistanceM,
  isSimplePolygon,
  polygonAreaM2,
  runEngine,
  MAX_ROOF_OUTLINE_POINTS,
  type EngineResult,
  type GpsPoint,
} from '@dossipv/engine';
import { requireOwnedProject, ProjectNotFoundError } from '../../../../../lib/project-access';
import { PROJECT_ENGINE_INCLUDE, buildEngineInput, type ProjectForEngine } from '../../../../../lib/project-engine-input';
import type { BuildingTypeValue } from '../../../../../lib/building-type';

const NOT_FOUND = 'Projet introuvable.';
const MAX_POINT_SPREAD_M = 500;
const MAX_FLOORS: Record<BuildingTypeValue, number> = { HOUSE: 3, APARTMENT_BUILDING: 15 };
/** Below this a "roof" is a slip of the finger, not a surface panels could stand on. */
const MIN_ROOF_AREA_M2 = 4;

export interface LocationsPayload {
  field: GpsPoint | null;
  technicalRoom: GpsPoint | null;
  meter: GpsPoint | null;
  earthPit: GpsPoint | null;
  floors: number | null;
  buildingType: BuildingTypeValue | null;
  /** The roof contour, optional: null (or absent) when the installer did not draw one. */
  roofOutline?: GpsPoint[] | null;
}

const REQUIRED_POINTS = [
  { key: 'field', label: 'Champ PV' },
  { key: 'technicalRoom', label: 'Local technique (onduleur)' },
  { key: 'meter', label: 'Compteur STEG' },
] as const;

const PAYLOAD_KEYS = ['field', 'technicalRoom', 'meter', 'earthPit', 'floors', 'buildingType'] as const;

function isPointOrNull(value: unknown): value is GpsPoint | null {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const { lat, lon } = value as Record<string, unknown>;
  return typeof lat === 'number' && typeof lon === 'number';
}

/** A Server Action's arguments come from the client as-is: check the shape before reading it. */
function isLocationsPayload(value: unknown): value is LocationsPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!PAYLOAD_KEYS.every((key) => key in record)) return false;
  return (
    isPointOrNull(record['field']) &&
    isPointOrNull(record['technicalRoom']) &&
    isPointOrNull(record['meter']) &&
    isPointOrNull(record['earthPit']) &&
    (record['floors'] === null || typeof record['floors'] === 'number') &&
    (record['buildingType'] === null || record['buildingType'] === 'HOUSE' || record['buildingType'] === 'APARTMENT_BUILDING') &&
    isRoofOutlineOrNull(record['roofOutline'])
  );
}

function isRoofOutlineOrNull(value: unknown): value is GpsPoint[] | null | undefined {
  if (value === undefined || value === null) return true;
  return Array.isArray(value) && value.length <= MAX_ROOF_OUTLINE_POINTS && value.every((point) => point !== null && isPointOrNull(point));
}

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
  if (payload.buildingType === null) return 'Indiquez si le client habite une maison ou un immeuble.';
  if (payload.floors === null) return "Indiquez l'étage du toit où seront posés les panneaux.";
  if (!Number.isInteger(payload.floors) || payload.floors < 0 || payload.floors > MAX_FLOORS[payload.buildingType]) {
    return 'Niveau du toit invalide.';
  }
  if (payload.buildingType === 'HOUSE' && payload.earthPit === null) {
    return 'Placez le point « Piquet de terre » : il est obligatoire pour une maison.';
  }
  return validateRoofOutline(payload.roofOutline ?? null, payload.field!);
}

function validateRoofOutline(outline: GpsPoint[] | null, field: GpsPoint): string | null {
  if (outline === null) return null;
  if (outline.length < 3) return 'Le contour du toit doit avoir au moins 3 sommets : terminez-le ou effacez-le.';
  if (!outline.every(isValidPoint)) return 'Coordonnées invalides.';
  if (outline.some((corner) => groundDistanceM(corner, field) > MAX_POINT_SPREAD_M)) {
    return `Le contour du toit est trop loin du champ PV (plus de ${MAX_POINT_SPREAD_M} m) : vérifiez-le.`;
  }
  if (!isSimplePolygon(outline)) return 'Le contour du toit se croise : retracez-le en suivant le bord du toit.';
  if (polygonAreaM2(outline) < MIN_ROOF_AREA_M2) return 'Le contour du toit est trop petit : retracez-le.';
  return null;
}

type Circuit = 'DC' | 'AC';

/** Does this circuit's cable carry its current (C16 / C13) within the circuit's own voltage-drop limit (DC 3 %, AC 1 %)? */
function circuitFits(result: EngineResult, circuit: Circuit, maxDropPct: number): boolean {
  const checkId = circuit === 'DC' ? 'C16' : 'C13';
  const dropPct = result.derived[circuit === 'DC' ? 'DU_DC_PCT' : 'DU_AC_PCT'];
  const carriesCurrent = result.checks.filter((check) => check.id === checkId).every((check) => check.pass);
  return carriesCurrent && (dropPct === undefined || dropPct <= maxDropPct);
}

/**
 * The installer placed the points: save them, derive the DC/AC run lengths, bump a run to the
 * cable's next larger section while its current-carrying check or voltage drop fails with the new
 * length, mark the cable runs and earthing as confirmed (flowStep READY) and open the summary
 * screen. Nothing is generated here: the installer reviews the summary first.
 */
export async function saveLocationsAction(
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

  if (!isLocationsPayload(payload)) return { error: 'Données des emplacements invalides.' };
  const invalid = validate(payload);
  if (invalid) return { error: invalid };
  const { field, technicalRoom, meter, earthPit, floors, buildingType } = payload;
  const roofOutline = payload.roofOutline ?? null;
  if (!field || !technicalRoom || !meter || floors === null || buildingType === null) return { error: 'Points manquants.' };

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
      buildingType,
      roofOutline: roofOutline ? roofOutline.map(({ lat, lon }) => ({ lat, lon })) : Prisma.DbNull,
    },
  });
  // A flat with no pit of its own is earthed on the building's existing earth: no dedicated rod.
  const useBuildingEarth = buildingType === 'APARTMENT_BUILDING' && earthPit === null;
  await db.projectEarthing.updateMany({ where: { projectId }, data: { useBuildingEarth, rodCount: useBuildingEarth ? 0 : 1 } });
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
        console.error('Locations: engine run failed', error);
        return { error: 'Erreur de calcul : vérifiez les sections du projet.' };
      }
      const maxDropPct =
        circuit === 'DC' ? built.input.maxVoltageDropPct : (built.input.maxAcVoltageDropPct ?? built.input.maxVoltageDropPct);
      if (circuitFits(result, circuit, maxDropPct)) break;

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
  redirect(`/projects/${projectId}/summary`);
}
