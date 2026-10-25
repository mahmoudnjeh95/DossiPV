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
    <main className="max-w-none px-(--gutter) pt-2.5 pb-3 max-[700px]:px-2 max-[700px]:pt-1.5 max-[700px]:pb-2">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 [&>p:first-child]:m-0 [&>p:first-child]:basis-full [&>h1]:m-0 [&>h1]:text-[1.3rem] [&>p:not(:first-child)]:m-0 [&>p:not(:first-child)]:text-[0.92rem] max-[700px]:[&>p:not(:first-child)]:hidden">
        <p className="mb-2 text-[0.9rem] [&_a]:no-underline">
          <Link href="/projects">Projets</Link> › <Link href={`/projects/${id}`}>{fullName}</Link> › Emplacements
        </p>
        <h1>Emplacements — {fullName}</h1>
        <p className="text-app-muted">Étape 1 sur 2 : placez les points et le toit sur la carte (les longueurs de câbles sont mesurées ici). Tout se déplace en le faisant glisser.</p>
      </div>
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
