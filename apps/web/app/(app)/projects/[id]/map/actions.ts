'use server';

import { db, type Prisma } from '@dossipv/db';
import { requireInstallerUser } from '../../../layout';

export interface ProjectGeometry {
  outline: { lat: number; lon: number }[];
  panelRows: { lat: number; lon: number; rotationDeg: number }[][];
  manualOverride: boolean;
}

export interface MapSavePayload {
  gpsLat: number;
  gpsLon: number;
  technicalRoomPointLat?: number;
  technicalRoomPointLon?: number;
  meterPointLat?: number;
  meterPointLon?: number;
  earthPitPointLat?: number;
  earthPitPointLon?: number;
  geometry?: ProjectGeometry;
}

export interface SaveMapDataActionError {
  error: string;
}

const MAX_OUTLINE_POINTS = 1000;
const MAX_PANEL_ROWS = 1000;
const MAX_POINTS_PER_ROW = 1000;

function isValidLat(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLon(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidOptionalCoordinate(value: number | undefined, validator: (value: number) => boolean): boolean {
  return value === undefined || validator(value);
}

function isValidPoint(point: { lat: number; lon: number }): boolean {
  return isValidLat(point.lat) && isValidLon(point.lon);
}

function isValidGeometry(geometry: ProjectGeometry): boolean {
  if (geometry.outline.length < 3 || geometry.outline.length > MAX_OUTLINE_POINTS) {
    return false;
  }
  if (!geometry.outline.every(isValidPoint)) {
    return false;
  }
  if (geometry.panelRows.length > MAX_PANEL_ROWS) {
    return false;
  }
  for (const row of geometry.panelRows) {
    if (row.length > MAX_POINTS_PER_ROW || !row.every((point) => isValidPoint(point) && Number.isFinite(point.rotationDeg))) {
      return false;
    }
  }
  return true;
}

function isValidPayload(payload: MapSavePayload): boolean {
  if (!isValidLat(payload.gpsLat) || !isValidLon(payload.gpsLon)) {
    return false;
  }
  if (
    !isValidOptionalCoordinate(payload.technicalRoomPointLat, isValidLat) ||
    !isValidOptionalCoordinate(payload.technicalRoomPointLon, isValidLon) ||
    !isValidOptionalCoordinate(payload.meterPointLat, isValidLat) ||
    !isValidOptionalCoordinate(payload.meterPointLon, isValidLon) ||
    !isValidOptionalCoordinate(payload.earthPitPointLat, isValidLat) ||
    !isValidOptionalCoordinate(payload.earthPitPointLon, isValidLon)
  ) {
    return false;
  }
  if (payload.geometry && !isValidGeometry(payload.geometry)) {
    return false;
  }
  return true;
}

export async function saveMapDataAction(
  projectId: string,
  payload: MapSavePayload,
): Promise<SaveMapDataActionError | void> {
  const user = await requireInstallerUser();

  const project = await db.project.findFirst({ where: { id: projectId, companyId: user.companyId } });
  if (!project) {
    return { error: 'Projet introuvable.' };
  }

  if (payload.geometry && project.tier !== 'PREMIUM') {
    return { error: "Le contour et le remplissage automatique nécessitent l'abonnement Premium." };
  }

  if (!isValidPayload(payload)) {
    return { error: 'Coordonnées invalides.' };
  }

  await db.projectSite.update({
    where: { projectId },
    data: {
      gpsLat: payload.gpsLat,
      gpsLon: payload.gpsLon,
      technicalRoomPointLat: payload.technicalRoomPointLat ?? null,
      technicalRoomPointLon: payload.technicalRoomPointLon ?? null,
      meterPointLat: payload.meterPointLat ?? null,
      meterPointLon: payload.meterPointLon ?? null,
      earthPitPointLat: payload.earthPitPointLat ?? null,
      earthPitPointLon: payload.earthPitPointLon ?? null,
    },
  });

  if (payload.geometry) {
    const geometryJson = payload.geometry as unknown as Prisma.InputJsonValue;
    await db.projectImagery.upsert({
      where: { projectId },
      create: { projectId, geometry: geometryJson },
      update: { geometry: geometryJson },
    });
  }
}
