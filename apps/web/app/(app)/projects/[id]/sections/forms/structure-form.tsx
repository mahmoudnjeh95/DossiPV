import type { ProjectStructure } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { STRUCTURE_MATERIAL_OPTIONS } from '../../../../../../lib/labels';
import { saveStructureAction } from '../actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
        <SelectField name="material" label="Matériau" options={STRUCTURE_MATERIAL_OPTIONS} defaultValue={structure?.material ?? 'ALUMINIUM'} />
        <Label>
          Vitesse de vent de calcul (km/h)
          <Input type="number" name="windSpeedKmh" step="any" min={0} defaultValue={structure?.windSpeedKmh ?? defaults.windSpeedKmh} required />
        </Label>
      </div>
    </SectionForm>
  );
}
