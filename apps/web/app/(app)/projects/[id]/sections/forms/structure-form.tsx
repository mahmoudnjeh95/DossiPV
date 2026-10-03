import type { ProjectStructure } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { STRUCTURE_MATERIAL_OPTIONS } from '../../../../../../lib/labels';
import { saveStructureAction } from '../actions';

export function StructureForm({
  projectId,
  structure,
  defaults,
  siteTiltDeg,
}: {
  projectId: string;
  structure: ProjectStructure | null;
  defaults: { windSpeedKmh: number };
  siteTiltDeg: number | null;
}): React.JSX.Element {
  const nonDefaultTilt = siteTiltDeg !== null && siteTiltDeg !== 30;
  return (
    <SectionForm action={saveStructureAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <fieldset>
        <legend>Châssis</legend>
        <div className="form-grid">
          <SelectField name="material" label="Matériau" options={STRUCTURE_MATERIAL_OPTIONS} defaultValue={structure?.material ?? 'ALUMINIUM'} />
          <label>
            Nombre de châssis
            <input type="number" name="frameCount" step={1} min={1} defaultValue={structure?.frameCount ?? ''} required />
          </label>
          <label>
            Poids de la structure (N)
            <input type="number" name="structureWeightN" step="any" min={0} defaultValue={structure?.structureWeightN ?? ''} required />
          </label>
          <label>
            Description des châssis
            <input type="text" name="frameDescription" defaultValue={structure?.frameDescription ?? ''} maxLength={500} />
          </label>
          <label>
            Description des rails
            <input type="text" name="railsDescription" defaultValue={structure?.railsDescription ?? ''} maxLength={500} />
          </label>
          <label>
            Description des fixations
            <input type="text" name="fixingDescription" defaultValue={structure?.fixingDescription ?? ''} maxLength={500} />
          </label>
          <label>
            Câbles d&apos;arrimage
            <input type="text" name="tieDownCables" defaultValue={structure?.tieDownCables ?? ''} maxLength={300} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Lestage</legend>
        <div className="form-grid">
          <label>
            Dalles par châssis
            <input type="number" name="ballastPerFrame" step={1} min={0} defaultValue={structure?.ballastPerFrame ?? ''} />
          </label>
          <label>
            Masse d&apos;une dalle (kg)
            <input type="number" name="ballastMassKg" step="any" min={0} defaultValue={structure?.ballastMassKg ?? ''} />
          </label>
          <label>
            Type de lest
            <input type="text" name="ballastType" defaultValue={structure?.ballastType ?? ''} maxLength={100} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Stabilité au vent</legend>
        <div className="form-grid">
          <label>
            Hauteur H (m)
            <input type="number" name="heightHM" step="any" min={0} defaultValue={structure?.heightHM ?? ''} required />
          </label>
          <label>
            Profondeur D (m)
            <input type="number" name="depthDM" step="any" min={0} defaultValue={structure?.depthDM ?? ''} required />
          </label>
          <label>
            Vitesse de vent de calcul (km/h)
            <input type="number" name="windSpeedKmh" step="any" min={0} defaultValue={structure?.windSpeedKmh ?? defaults.windSpeedKmh} required />
          </label>
          <label>
            Coefficient de soulèvement (N/m²)
            <input type="number" name="liftCoeffNPerM2" step="any" min={0} defaultValue={structure?.liftCoeffNPerM2 ?? ''} />
          </label>
          <label>
            Coefficient de traînée (N/m²)
            <input type="number" name="dragCoeffNPerM2" step="any" min={0} defaultValue={structure?.dragCoeffNPerM2 ?? ''} />
          </label>
        </div>
        <p className="hint">
          Les coefficients par défaut (339 / 196 N/m²) ne sont valables qu&apos;à 120 km/h et 30° d&apos;inclinaison. Pour toute
          autre combinaison, saisissez les coefficients recalculés par votre bureau de contrôle, sinon la génération sera bloquée.
          {nonDefaultTilt && ` Le site est incliné à ${siteTiltDeg}° : les coefficients sont donc requis.`}
        </p>
      </fieldset>
    </SectionForm>
  );
}
