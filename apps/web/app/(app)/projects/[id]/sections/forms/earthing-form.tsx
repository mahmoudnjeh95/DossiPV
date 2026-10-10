import type { ProjectEarthing } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField, equipmentOptions, type EquipmentOption } from '../../../../../../components/select-field';
import { saveEarthingAction } from '../actions';

export function EarthingForm({
  projectId,
  earthing,
  defaults,
  earthCables,
}: {
  projectId: string;
  earthing: ProjectEarthing | null;
  defaults: { targetResistanceOhm: number | null };
  earthCables: EquipmentOption[];
}): React.JSX.Element {
  const targetResistance = earthing?.targetResistanceOhm ?? defaults.targetResistanceOhm;
  return (
    <SectionForm action={saveEarthingAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <div className="form-grid">
        <SelectField name="earthCableId" label="Câble de terre" options={equipmentOptions(earthCables)} defaultValue={earthing?.earthCableId} allowEmpty required />
        <label>
          Nombre de piquets
          <input type="number" name="rodCount" step={1} min={1} defaultValue={earthing?.rodCount ?? 1} required />
        </label>
        {targetResistance === null || targetResistance === undefined ? (
          <label>
            Résistance cible (Ω)
            <input type="number" name="targetResistanceOhm" step="any" min={0} required />
          </label>
        ) : (
          <input type="hidden" name="targetResistanceOhm" value={targetResistance} />
        )}
      </div>
    </SectionForm>
  );
}
