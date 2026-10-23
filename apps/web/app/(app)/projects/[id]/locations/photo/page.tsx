import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@dossipv/db';
import { parseRoofOutline, parseSiteImagePoints } from '@dossipv/engine';
import { siteImageUrl } from '../../../../../../lib/site-image';
import { requireAuthenticatedCompanyUser } from '../../../../layout';
import { SitePhotoEditorClientOnly as SitePhotoEditor } from './site-photo-editor-loader';

function point(lat: number | null, lon: number | null): { lat: number; lon: number } | null {
  return lat !== null && lon !== null ? { lat, lon } : null;
}

/** Step 2 of Emplacements, optional: the installer's Google Maps capture with the points placed again on it, for the 3D annex. */
export default async function SitePhotoPage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  const user = await requireAuthenticatedCompanyUser();
  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: { site: true, client: true },
  });
  if (!project || !project.site) notFound();
  const { site } = project;
  const fullName = project.client?.fullName ?? 'Projet';
  const map = {
    field: point(site.installationPointLat, site.installationPointLon),
    technicalRoom: point(site.technicalRoomPointLat, site.technicalRoomPointLon),
    meter: point(site.meterPointLat, site.meterPointLon),
    earthPit: point(site.earthPitPointLat, site.earthPitPointLon),
  };

  return (
    <main className="locations-main">
      <div className="locations-head">
        <p className="breadcrumb">
          <Link href="/projects">Projets</Link> › <Link href={`/projects/${id}`}>{fullName}</Link> ›{' '}
          <Link href={`/projects/${id}/locations`}>Emplacements</Link> › Photo pour l&apos;annexe 3D
        </p>
        <h1>Photo pour l&apos;annexe 3D — {fullName}</h1>
        <p className="muted">
          Étape 2 sur 2, facultative : une capture Google Maps où vous placez de nouveau les points et le toit. Elle sert aux dessins ; les longueurs
          restent celles mesurées sur la carte.
        </p>
      </div>
      {map.field && map.technicalRoom && map.meter ? (
        <SitePhotoEditor
          projectId={id}
          mapPoints={map}
          mapHasRoof={parseRoofOutline(site.roofOutline) !== null}
          initialImageUrl={site.siteImageFileId ? siteImageUrl(id, site.siteImageFileId) : null}
          initialPoints={parseSiteImagePoints(site.siteImagePoints)}
        />
      ) : (
        <section className="card">
          <p>Placez d&apos;abord les points sur la carte : la photo se met à l&apos;échelle grâce à eux.</p>
          <Link className="button" href={`/projects/${id}/locations`}>
            Revenir à la carte
          </Link>
        </section>
      )}
    </main>
  );
}
