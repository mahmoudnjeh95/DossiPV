import type { ProjectSimulation } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { SIMULATION_SOURCE_OPTIONS } from '../../../../../../lib/labels';
import { saveSimulationAction } from '../actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SimulationForm({ projectId, simulation }: { projectId: string; simulation: ProjectSimulation | null }): React.JSX.Element {
  return (
    <SectionForm action={saveSimulationAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
        <SelectField name="source" label="Source de la simulation" options={SIMULATION_SOURCE_OPTIONS} defaultValue={simulation?.source ?? 'PVGIS_LIVE'} />
        <Label>
          Production annuelle (kWh)
          <Input type="number" name="annualProductionKWh" step="any" min={0} defaultValue={simulation?.annualProductionKWh ?? ''} />
          <span className="text-[0.8rem] font-normal text-app-muted">Obligatoire si le rapport PVsyst est fourni ; calculée automatiquement sinon.</span>
        </Label>
        <Label>
          Productible spécifique (kWh/kWc)
          <Input type="number" name="specificYieldKWhPerKWp" step="any" min={0} defaultValue={simulation?.specificYieldKWhPerKWp ?? ''} />
        </Label>
        <Label>
          Performance ratio (%)
          <Input type="number" name="performanceRatioPct" step="any" min={0} max={100} defaultValue={simulation?.performanceRatioPct ?? ''} />
        </Label>
        <Label>
          Pertes système (%)
          <Input type="number" name="systemLossesPct" step="any" min={0} max={100} defaultValue={simulation?.systemLossesPct ?? ''} />
        </Label>
        <Label>
          Rapport PVsyst (PDF)
          <Input type="file" name="pvsystReport" accept="application/pdf" />
          <span className="text-[0.8rem] font-normal text-app-muted">
            {simulation?.pvsystReportFileId ? 'Un rapport est déjà enregistré ; en choisir un le remplace.' : 'Requis en mode « Rapport PVsyst ».'}
          </span>
        </Label>
      </div>
      <p className="text-[0.8rem] font-normal text-app-muted">
        En mode automatique, la simulation horaire est produite à partir des données PVGIS du point GPS du site lors de la
        génération.
      </p>
    </SectionForm>
  );
}
