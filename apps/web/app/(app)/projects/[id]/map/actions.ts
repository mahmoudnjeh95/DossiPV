'use server';

import { db, type Prisma } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../../layout';

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

export async function saveMapDataAction(
  projectId: string,
  payload: MapSavePayload,
): Promise<SaveMapDataActionError | void> {
  const user = await requireAuthenticatedCompanyUser();

  const project = await db.project.findFirst({ where: { id: projectId, companyId: user.companyId } });
  if (!project) {
    return { error: 'Projet introuvable.' };
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
