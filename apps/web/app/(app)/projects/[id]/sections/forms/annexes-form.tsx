import { SectionForm } from '../../../../../../components/section-form';
import { saveAnnexesAction } from '../actions';
import { ExtraFilesField } from './extra-files-field';

export interface AnnexesFormValues {
  hasCin: boolean;
  hasCommercialRegister: boolean;
  hasStegContract: boolean;
  hasLastPaidBill: boolean;
  hasModuleAcceptance: boolean;
  extraFileCount: number;
}

function FileField({ name, label, hasExisting }: { name: string; label: string; hasExisting: boolean }): React.JSX.Element {
  return (
    <label>
      {label}
      <input type="file" name={name} accept="application/pdf,image/png,image/jpeg" />
      <span className="hint">{hasExisting ? 'Un fichier est déjà enregistré ; en choisir un le remplace.' : 'Aucun fichier déposé.'}</span>
    </label>
  );
}

export function AnnexesForm({ projectId, annexes }: { projectId: string; annexes: AnnexesFormValues }): React.JSX.Element {
  return (
    <SectionForm action={saveAnnexesAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <div className="form-grid">
        <FileField name="cin" label="Carte d'identité nationale (CIN)" hasExisting={annexes.hasCin} />
        <FileField name="commercialRegister" label="Registre de commerce" hasExisting={annexes.hasCommercialRegister} />
        <FileField name="stegContract" label="Contrat STEG" hasExisting={annexes.hasStegContract} />
        <FileField name="lastPaidBill" label="Dernière facture payée" hasExisting={annexes.hasLastPaidBill} />
        <FileField
          name="moduleAcceptance"
          label="Lettre d'acceptation ANME du module (fournie par le distributeur)"
          hasExisting={annexes.hasModuleAcceptance}
        />
      </div>
      <ExtraFilesField />
      {annexes.extraFileCount > 0 && (
        <p className="hint">{annexes.extraFileCount} fichier(s) supplémentaire(s) déjà enregistré(s) ; tout nouvel ajout remplace l&apos;ensemble.</p>
      )}
    </SectionForm>
  );
}
