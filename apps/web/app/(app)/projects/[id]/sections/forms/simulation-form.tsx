import type { ProjectSimulation } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { SIMULATION_SOURCE_OPTIONS } from '../../../../../../lib/labels';
import { saveSimulationAction } from '../actions';

export function SimulationForm({ projectId, simulation }: { projectId: string; simulation: ProjectSimulation | null }): React.JSX.Element {
  return (
    <SectionForm action={saveSimulationAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <div className="form-grid">
        <SelectField name="source" label="Source de la simulation" options={SIMULATION_SOURCE_OPTIONS} defaultValue={simulation?.source ?? 'PVGIS_LIVE'} />
        <label>
          Production annuelle (kWh)
          <input type="number" name="annualProductionKWh" step="any" min={0} defaultValue={simulation?.annualProductionKWh ?? ''} />
          <span className="hint">Obligatoire si le rapport PVsyst est fourni ; calculée automatiquement sinon.</span>
        </label>
        <label>
          Productible spécifique (kWh/kWc)
          <input type="number" name="specificYieldKWhPerKWp" step="any" min={0} defaultValue={simulation?.specificYieldKWhPerKWp ?? ''} />
        </label>
        <label>
          Performance ratio (%)
          <input type="number" name="performanceRatioPct" step="any" min={0} max={100} defaultValue={simulation?.performanceRatioPct ?? ''} />
        </label>
        <label>
          Pertes système (%)
          <input type="number" name="systemLossesPct" step="any" min={0} max={100} defaultValue={simulation?.systemLossesPct ?? ''} />
        </label>
        <label>
          Rapport PVsyst (PDF)
          <input type="file" name="pvsystReport" accept="application/pdf" />
          <span className="hint">
            {simulation?.pvsystReportFileId ? 'Un rapport est déjà enregistré ; en choisir un le remplace.' : 'Requis en mode « Rapport PVsyst ».'}
          </span>
        </label>
      </div>
      <p className="hint">
        En mode automatique, la simulation horaire est produite à partir des données PVGIS du point GPS du site lors de la
        génération.
      </p>
    </SectionForm>
  );
}
