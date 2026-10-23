import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { parseRoofOutline } from '@dossipv/engine';
import { guessBuildingType } from '../../../../../lib/building-type';
import { requireAuthenticatedCompanyUser } from '../../../layout';
import { LocationsMapClientOnly as LocationsMap } from './locations-map-loader';

function point(lat: number | null, lon: number | null): { lat: number; lon: number } | null {
  return lat !== null && lon !== null ? { lat, lon } : null;
}

export default async function LocationsPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  const user = await requireAuthenticatedCompanyUser();
  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: { site: true, client: true },
  });
  if (!project || !project.site) notFound();
  const { site } = project;
  const fullName = project.client?.fullName ?? 'Projet';

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/projects">Projets</Link> › <Link href={`/projects/${id}`}>{fullName}</Link> › Emplacements
      </p>
      <h1>Emplacements — {fullName}</h1>
      <p className="muted">
        Touchez un bouton puis la carte pour placer chaque point. Les points sont déplaçables. Vous pouvez aussi tracer le
        contour du toit : il apparaît sur le plan d&apos;implantation et la vue 3D du dossier.
      </p>
      <LocationsMap
        projectId={id}
        center={{ lat: site.gpsLat, lon: site.gpsLon }}
        initial={{
          field: point(site.installationPointLat, site.installationPointLon),
          technicalRoom: point(site.technicalRoomPointLat, site.technicalRoomPointLon),
          meter: point(site.meterPointLat, site.meterPointLon),
          earthPit: point(site.earthPitPointLat, site.earthPitPointLon),
        }}
        initialRoofOutline={parseRoofOutline(site.roofOutline)}
        initialFloors={site.floors}
        initialBuildingType={site.buildingType ?? guessBuildingType(project.client?.address ?? null)}
      />
    </main>
  );
}
