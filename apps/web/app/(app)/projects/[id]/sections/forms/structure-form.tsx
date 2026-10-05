import type { ProjectStructure } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { STRUCTURE_MATERIAL_OPTIONS } from '../../../../../../lib/labels';
import { saveStructureAction } from '../actions';

export function StructureForm({
  projectId,
  structure,
  defaults,
}: {
  projectId: string;
  structure: ProjectStructure | null;
  defaults: { windSpeedKmh: number };
}): React.JSX.Element {
  return (
    <SectionForm action={saveStructureAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <div className="form-grid">
        <SelectField name="material" label="Matériau" options={STRUCTURE_MATERIAL_OPTIONS} defaultValue={structure?.material ?? 'ALUMINIUM'} />
        <label>
          Vitesse de vent de calcul (km/h)
          <input type="number" name="windSpeedKmh" step="any" min={0} defaultValue={structure?.windSpeedKmh ?? defaults.windSpeedKmh} required />
        </label>
      </div>
    </SectionForm>
  );
}
