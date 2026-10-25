import Link from 'next/link';
import type { ProjectSite } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { PHASES_OPTIONS } from '../../../../../../lib/labels';
import { saveSiteAction } from '../actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SiteForm({ projectId, site }: { projectId: string; site: ProjectSite | null }): React.JSX.Element {
  return (
    <SectionForm action={saveSiteAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <fieldset>
        <legend>Position</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Latitude
            <Input type="number" name="gpsLat" step="any" min={-90} max={90} defaultValue={site?.gpsLat ?? ''} required />
          </Label>
          <Label>
            Longitude
            <Input type="number" name="gpsLon" step="any" min={-180} max={180} defaultValue={site?.gpsLon ?? ''} required />
          </Label>
        </div>
        <p className="text-[0.8rem] font-normal text-app-muted">
          Point GPS unique du dossier (page de garde, plan de situation et simulation).{' '}
          {site ? (
            <Link href={`/projects/${projectId}/map`}>Ajuster sur la carte et placer les repères</Link>
          ) : (
            'Enregistrez le site une première fois pour ouvrir l’éditeur de carte.'
          )}
        </p>
      </fieldset>
      <fieldset>
        <legend>Installation</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <SelectField name="phases" label="Phases" options={PHASES_OPTIONS} defaultValue={site?.phases ?? 1} />
          <Label>
            Inclinaison (°)
            <Input type="number" name="tiltDeg" step="any" min={0} max={90} defaultValue={site?.tiltDeg ?? 30} required />
          </Label>
          <Label>
            Azimut (°)
            <Input type="number" name="azimuthDeg" step="any" min={-180} max={360} defaultValue={site?.azimuthDeg ?? 0} />
            <span className="text-[0.8rem] font-normal text-app-muted">0 = plein sud.</span>
          </Label>
          <Label inline>
            <Input type="checkbox" name="lightningRod" defaultChecked={site?.lightningRod ?? false} />
            Bâtiment équipé d&apos;un paratonnerre
          </Label>
        </div>
      </fieldset>
    </SectionForm>
  );
}
