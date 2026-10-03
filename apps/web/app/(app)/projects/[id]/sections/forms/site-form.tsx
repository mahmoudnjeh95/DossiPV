import Link from 'next/link';
import type { ProjectSite } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import {
  GRID_TYPE_OPTIONS,
  PHASES_OPTIONS,
  MOUNTING_TYPE_OPTIONS,
  SHADING_OPTIONS,
  EQUIPMENT_LOCATION_OPTIONS,
} from '../../../../../../lib/labels';
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
        <legend>Raccordement</legend>
        <div className="form-grid">
          <SelectField name="gridType" label="Type de réseau" options={GRID_TYPE_OPTIONS} defaultValue={site?.gridType ?? 'BT'} />
          <SelectField name="phases" label="Phases" options={PHASES_OPTIONS} defaultValue={site?.phases ?? 1} />
          <label className="inline">
            <input type="checkbox" name="lightningRod" defaultChecked={site?.lightningRod ?? false} />
            Bâtiment équipé d&apos;un paratonnerre
          </label>
          <label className="inline">
            <input type="checkbox" name="generator" defaultChecked={site?.generator ?? false} />
            Groupe électrogène présent
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Implantation</legend>
        <div className="form-grid">
          <SelectField name="mountingType" label="Type de pose" options={MOUNTING_TYPE_OPTIONS} defaultValue={site?.mountingType ?? 'FLAT_ROOF_BALLAST'} />
          <label>
            Matériau de toiture
            <input type="text" name="roofMaterial" defaultValue={site?.roofMaterial ?? ''} maxLength={100} />
          </label>
          <label>
            Hauteur du bâtiment (m)
            <input type="number" name="buildingHeightM" step="any" min={0} defaultValue={site?.buildingHeightM ?? ''} />
          </label>
          <label>
            Inclinaison (°)
            <input type="number" name="tiltDeg" step="any" min={0} max={90} defaultValue={site?.tiltDeg ?? 30} required />
            <span className="hint">Les constantes de lestage du modèle supposent 30°.</span>
          </label>
          <label>
            Azimut (°)
            <input type="number" name="azimuthDeg" step="any" min={-180} max={360} defaultValue={site?.azimuthDeg ?? 0} />
            <span className="hint">0 = plein sud.</span>
          </label>
          <SelectField name="shading" label="Ombrage" options={SHADING_OPTIONS} defaultValue={site?.shading} allowEmpty />
          <label>
            Notes sur l&apos;ombrage
            <input type="text" name="shadingNotes" defaultValue={site?.shadingNotes ?? ''} maxLength={500} />
          </label>
          <SelectField
            name="equipmentLocation"
            label="Emplacement des équipements"
            options={EQUIPMENT_LOCATION_OPTIONS}
            defaultValue={site?.equipmentLocation}
            allowEmpty
          />
        </div>
      </fieldset>
    </SectionForm>
  );
}
