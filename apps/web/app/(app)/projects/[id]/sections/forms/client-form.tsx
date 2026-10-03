import type { ProjectClient } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { CIVILITY_OPTIONS, CLIENT_KIND_OPTIONS } from '../../../../../../lib/labels';
import { saveClientAction } from '../actions';

export function ClientForm({ projectId, client, locked }: { projectId: string; client: ProjectClient | null; locked: boolean }): React.JSX.Element {
  return (
    <SectionForm action={saveClientAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      {locked && (
        <div className="banner banner-warn">
          Le nom du client et la référence STEG sont verrouillés depuis la première génération de ce dossier.
        </div>
      )}
      <div className="form-grid">
        <SelectField name="civility" label="Civilité" options={CIVILITY_OPTIONS} defaultValue={client?.civility} allowEmpty />
        <label>
          Nom complet
          <input type="text" name="fullName" defaultValue={client?.fullName ?? ''} required maxLength={200} disabled={locked} />
        </label>
        <SelectField name="clientKind" label="Type de client" options={CLIENT_KIND_OPTIONS} defaultValue={client?.clientKind ?? 'residential'} />
        <label>
          Référence STEG
          <input type="text" name="stegReference" defaultValue={client?.stegReference ?? ''} maxLength={100} disabled={locked} />
          <span className="hint">Référence du contrat / compteur STEG. Obligatoire pour générer.</span>
        </label>
        <label>
          CIN
          <input type="text" name="cin" defaultValue={client?.cin ?? ''} maxLength={20} />
        </label>
        <label>
          Registre de commerce
          <input type="text" name="commercialRegister" defaultValue={client?.commercialRegister ?? ''} maxLength={50} />
        </label>
        <label>
          Téléphone
          <input type="tel" name="phone" defaultValue={client?.phone ?? ''} maxLength={30} />
        </label>
        <label>
          Adresse
          <input type="text" name="address" defaultValue={client?.address ?? ''} maxLength={300} />
          <span className="hint">Obligatoire pour générer.</span>
        </label>
        <label>
          Ville
          <input type="text" name="city" defaultValue={client?.city ?? ''} maxLength={100} />
        </label>
        <label>
          Gouvernorat
          <input type="text" name="governorate" defaultValue={client?.governorate ?? ''} maxLength={100} />
        </label>
        <label>
          Consommation annuelle (kWh)
          <input type="number" name="annualConsumptionKWh" step="any" min={0} defaultValue={client?.annualConsumptionKWh ?? ''} />
        </label>
        <label>
          Puissance souscrite (kVA)
          <input type="number" name="subscribedPowerKVA" step="any" min={0} defaultValue={client?.subscribedPowerKVA ?? ''} />
        </label>
      </div>
      <p className="hint">
        Ces informations personnelles restent dans votre espace : elles ne sont jamais transmises au service de rédaction
        automatique.
      </p>
    </SectionForm>
  );
}
