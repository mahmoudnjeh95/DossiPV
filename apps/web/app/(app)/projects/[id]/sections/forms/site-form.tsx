import Link from 'next/link';
import type { ProjectSite } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { PHASES_OPTIONS } from '../../../../../../lib/labels';
import { saveSiteAction } from '../actions';

export function SiteForm({ projectId, site }: { projectId: string; site: ProjectSite | null }): React.JSX.Element {
  return (
    <SectionForm action={saveSiteAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <fieldset>
        <legend>Position</legend>
        <div className="form-grid">
          <label>
            Latitude
            <input type="number" name="gpsLat" step="any" min={-90} max={90} defaultValue={site?.gpsLat ?? ''} required />
          </label>
          <label>
            Longitude
            <input type="number" name="gpsLon" step="any" min={-180} max={180} defaultValue={site?.gpsLon ?? ''} required />
          </label>
        </div>
        <p className="hint">
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
        <div className="form-grid">
          <SelectField name="phases" label="Phases" options={PHASES_OPTIONS} defaultValue={site?.phases ?? 1} />
          <label>
            Inclinaison (°)
            <input type="number" name="tiltDeg" step="any" min={0} max={90} defaultValue={site?.tiltDeg ?? 30} required />
          </label>
          <label>
            Azimut (°)
            <input type="number" name="azimuthDeg" step="any" min={-180} max={360} defaultValue={site?.azimuthDeg ?? 0} />
            <span className="hint">0 = plein sud.</span>
          </label>
          <label className="inline">
            <input type="checkbox" name="lightningRod" defaultChecked={site?.lightningRod ?? false} />
            Bâtiment équipé d&apos;un paratonnerre
          </label>
        </div>
      </fieldset>
    </SectionForm>
  );
}
