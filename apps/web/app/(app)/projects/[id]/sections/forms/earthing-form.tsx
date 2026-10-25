import type { ProjectEarthing } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField, equipmentOptions, type EquipmentOption } from '../../../../../../components/select-field';
import { saveEarthingAction } from '../actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
        <SelectField name="earthCableId" label="Câble de terre" options={equipmentOptions(earthCables)} defaultValue={earthing?.earthCableId} allowEmpty required />
        {earthing?.useBuildingEarth ? (
          <p className="text-app-muted">Mise à la terre : terre existante du bâtiment (aucun piquet dédié). Modifiez ce choix à l'étape Emplacements.</p>
        ) : (
          <Label>
            Nombre de piquets
            <Input type="number" name="rodCount" step={1} min={1} defaultValue={earthing?.rodCount ?? 1} required />
          </Label>
        )}
        {targetResistance === null || targetResistance === undefined ? (
          <Label>
            Résistance cible (Ω)
            <Input type="number" name="targetResistanceOhm" step="any" min={0} required />
          </Label>
        ) : (
          <Input type="hidden" name="targetResistanceOhm" value={targetResistance} />
        )}
      </div>
    </SectionForm>
  );
}
