import type { ProjectEarthing } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField, equipmentOptions, type EquipmentOption } from '../../../../../../components/select-field';
import { saveEarthingAction } from '../actions';

export function EarthingForm({
  projectId,
  earthing,
  defaults,
  earthCables,
  distributionBlocks,
}: {
  projectId: string;
  earthing: ProjectEarthing | null;
  defaults: { targetResistanceOhm: number | null };
  earthCables: EquipmentOption[];
  distributionBlocks: EquipmentOption[];
}): React.JSX.Element {
  return (
    <SectionForm action={saveEarthingAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <div className="form-grid">
        <SelectField name="earthCableId" label="Câble de terre" options={equipmentOptions(earthCables)} defaultValue={earthing?.earthCableId} allowEmpty required />
        <SelectField name="distributionBlockId" label="Répartiteur de terre" options={equipmentOptions(distributionBlocks)} defaultValue={earthing?.distributionBlockId} allowEmpty />
        <label>
          Section conducteur principal (mm²)
          <input type="number" name="mainEarthSectionMm2" step="any" min={0} defaultValue={earthing?.mainEarthSectionMm2 ?? 16} required />
        </label>
        <label>
          Section liaison des châssis (mm²)
          <input type="number" name="frameEarthSectionMm2" step="any" min={0} defaultValue={earthing?.frameEarthSectionMm2 ?? 16} required />
        </label>
        <label>
          Section vers la prise de terre (mm²)
          <input type="number" name="earthToPitSectionMm2" step="any" min={0} defaultValue={earthing?.earthToPitSectionMm2 ?? 25} required />
        </label>
        <label>
          Nombre de piquets
          <input type="number" name="rodCount" step={1} min={1} defaultValue={earthing?.rodCount ?? 1} required />
        </label>
        <label>
          Longueur des piquets (m)
          <input type="number" name="rodLengthM" step="any" min={0} defaultValue={earthing?.rodLengthM ?? 1.5} required />
        </label>
        <label>
          Espacement des piquets (cm)
          <input type="number" name="rodSpacingCm" step="any" min={0} defaultValue={earthing?.rodSpacingCm ?? ''} />
        </label>
        <label>
          Dimensions du regard (cm)
          <input type="text" name="pitSizeCm" defaultValue={earthing?.pitSizeCm ?? ''} maxLength={50} />
        </label>
        <label>
          Résistance cible (Ω)
          <input type="number" name="targetResistanceOhm" step="any" min={0} defaultValue={earthing?.targetResistanceOhm ?? defaults.targetResistanceOhm ?? ''} required />
        </label>
      </div>
    </SectionForm>
  );
}
