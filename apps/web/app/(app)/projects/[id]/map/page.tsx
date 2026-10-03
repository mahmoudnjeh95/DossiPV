import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { MapEditor } from './map-editor';

export interface MapPageData {
  project: { id: string; tier: 'STANDARD' | 'PREMIUM' };
  site: {
    gpsLat: number;
    gpsLon: number;
    technicalRoomPointLat: number | null;
    technicalRoomPointLon: number | null;
    meterPointLat: number | null;
    meterPointLon: number | null;
    earthPitPointLat: number | null;
    earthPitPointLon: number | null;
  };
  geometry: unknown;
  moduleInfo: { count: number; lengthM: number; widthM: number; tiltDeg: number } | null;
}

export async function loadMapPageData(projectId: string): Promise<MapPageData | null> {
  const user = await requireAuthenticatedCompanyUser();

  const project = await db.project.findFirst({
    where: { id: projectId, companyId: user.companyId },
    include: {
      site: true,
      imagery: true,
      arrayConfig: { include: { module: true, inverters: { include: { mppts: true } } } },
    },
  });

  if (!project || !project.site) {
    return null;
  }

  let moduleInfo: MapPageData['moduleInfo'] = null;
  if (project.arrayConfig) {
    const moduleCount = project.arrayConfig.inverters.reduce(
      (total, inverter) =>
        total + inverter.mppts.reduce((mpptTotal, mppt) => mpptTotal + mppt.stringsInParallel * mppt.modulesPerString, 0),
      0,
    );
    moduleInfo = {
      count: moduleCount,
      lengthM: project.arrayConfig.module.lengthMm / 1000,
      widthM: project.arrayConfig.module.widthMm / 1000,
      tiltDeg: project.site.tiltDeg,
    };
  }

  return {
    project: { id: project.id, tier: project.tier },
    site: {
      gpsLat: project.site.gpsLat,
      gpsLon: project.site.gpsLon,
      technicalRoomPointLat: project.site.technicalRoomPointLat,
      technicalRoomPointLon: project.site.technicalRoomPointLon,
      meterPointLat: project.site.meterPointLat,
      meterPointLon: project.site.meterPointLon,
      earthPitPointLat: project.site.earthPitPointLat,
      earthPitPointLon: project.site.earthPitPointLon,
    },
    geometry: project.imagery?.geometry ?? null,
    moduleInfo,
  };
}

export default async function MapPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  const data = await loadMapPageData(id);

  if (!data) {
    notFound();
  }

  return (
    <MapEditor
      projectId={data.project.id}
      tier={data.project.tier}
      site={data.site}
      geometry={data.geometry}
      moduleInfo={data.moduleInfo}
    />
  );
}
