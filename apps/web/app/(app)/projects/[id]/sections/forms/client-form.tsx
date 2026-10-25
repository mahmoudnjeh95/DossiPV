import type { ProjectClient } from '@dossipv/db';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField } from '../../../../../../components/select-field';
import { CIVILITY_OPTIONS, CLIENT_KIND_OPTIONS } from '../../../../../../lib/labels';
import { saveClientAction } from '../actions';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ClientForm({ projectId, client, locked }: { projectId: string; client: ProjectClient | null; locked: boolean }): React.JSX.Element {
  return (
    <SectionForm action={saveClientAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      {locked && (
        <Alert variant="warn">
          Le nom du client et la référence STEG sont verrouillés depuis la première génération de ce dossier.
        </Alert>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
        <SelectField name="civility" label="Civilité" options={CIVILITY_OPTIONS} defaultValue={client?.civility} allowEmpty />
        <Label>
          Nom complet
          <Input type="text" name="fullName" defaultValue={client?.fullName ?? ''} required maxLength={200} disabled={locked} />
        </Label>
        <SelectField name="clientKind" label="Type de client" options={CLIENT_KIND_OPTIONS} defaultValue={client?.clientKind ?? 'residential'} />
        <Label>
          Référence STEG
          <Input type="text" name="stegReference" defaultValue={client?.stegReference ?? ''} maxLength={100} disabled={locked} />
          <span className="text-[0.8rem] font-normal text-app-muted">Référence du contrat / compteur STEG. Obligatoire pour générer.</span>
        </Label>
        <Label>
          CIN
          <Input type="text" name="cin" defaultValue={client?.cin ?? ''} maxLength={20} />
        </Label>
        <Label>
          Registre de commerce
          <Input type="text" name="commercialRegister" defaultValue={client?.commercialRegister ?? ''} maxLength={50} />
        </Label>
        <Label>
          Téléphone
          <Input type="tel" name="phone" defaultValue={client?.phone ?? ''} maxLength={30} />
        </Label>
        <Label>
          Adresse
          <Input type="text" name="address" defaultValue={client?.address ?? ''} maxLength={300} />
          <span className="text-[0.8rem] font-normal text-app-muted">Obligatoire pour générer.</span>
        </Label>
        <Label>
          Ville
          <Input type="text" name="city" defaultValue={client?.city ?? ''} maxLength={100} />
        </Label>
        <Label>
          Gouvernorat
          <Input type="text" name="governorate" defaultValue={client?.governorate ?? ''} maxLength={100} />
        </Label>
        <Label>
          Consommation annuelle (kWh)
          <Input type="number" name="annualConsumptionKWh" step="any" min={0} defaultValue={client?.annualConsumptionKWh ?? ''} />
        </Label>
        <Label>
          Puissance souscrite (kVA)
          <Input type="number" name="subscribedPowerKVA" step="any" min={0} defaultValue={client?.subscribedPowerKVA ?? ''} />
        </Label>
      </div>
      <p className="text-[0.8rem] font-normal text-app-muted">
        Ces informations personnelles restent dans votre espace : elles ne sont jamais transmises au service de rédaction
        automatique.
      </p>
    </SectionForm>
  );
}
