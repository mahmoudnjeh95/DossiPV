'use client';

import { useActionState } from 'react';
import { saveCompanyAction, type SaveCompanyActionState } from './actions';

export interface CompanyFormValues {
  name: string;
  shortName: string | null;
  slogan: string | null;
  address: string;
  phone: string;
  email: string;
  taxId: string | null;
  commercialRegister: string | null;
  legalRepFullName: string;
  legalRepRole: string;
  anmeCode: string;
  anmeReference: string | null;
  anmeCategory: string;
  anmeValidFrom: string;
  anmeValidTo: string;
  defaultTMinC: number;
  defaultTMaxC: number;
  defaultMaxVoltageDropPct: number;
  defaultEarthResistanceTargetOhm: number | null;
  defaultDesignWindSpeedKmh: number;
  defaultCosPhi: number;
}

export function CompanyForm({ company }: { company: CompanyFormValues }): React.JSX.Element {
  const [state, formAction, pending] = useActionState<SaveCompanyActionState | undefined, FormData>(saveCompanyAction, undefined);

  return (
    <form action={formAction} className="stack">
      <fieldset className="card">
        <legend>Identité</legend>
        <div className="form-grid">
          <label>
            Raison sociale
            <input type="text" name="name" defaultValue={company.name} required maxLength={200} />
          </label>
          <label>
            Nom court
            <input type="text" name="shortName" defaultValue={company.shortName ?? ''} maxLength={50} />
          </label>
          <label>
            Slogan
            <input type="text" name="slogan" defaultValue={company.slogan ?? ''} maxLength={200} />
          </label>
          <label>
            Adresse
            <input type="text" name="address" defaultValue={company.address} required maxLength={300} />
          </label>
          <label>
            Téléphone
            <input type="tel" name="phone" defaultValue={company.phone} required maxLength={30} />
          </label>
          <label>
            Email de contact
            <input type="email" name="email" defaultValue={company.email} required maxLength={200} />
          </label>
          <label>
            Matricule fiscal
            <input type="text" name="taxId" defaultValue={company.taxId ?? ''} maxLength={50} />
          </label>
          <label>
            Registre de commerce
            <input type="text" name="commercialRegister" defaultValue={company.commercialRegister ?? ''} maxLength={50} />
          </label>
          <label>
            Représentant légal
            <input type="text" name="legalRepFullName" defaultValue={company.legalRepFullName} required maxLength={200} />
          </label>
          <label>
            Fonction
            <input type="text" name="legalRepRole" defaultValue={company.legalRepRole} required maxLength={100} />
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Accréditation ANME</legend>
        <div className="form-grid">
          <label>
            Code ANME
            <input type="text" name="anmeCode" defaultValue={company.anmeCode} required maxLength={50} />
          </label>
          <label>
            Référence
            <input type="text" name="anmeReference" defaultValue={company.anmeReference ?? ''} maxLength={100} />
          </label>
          <label>
            Catégorie
            <select name="anmeCategory" defaultValue={company.anmeCategory}>
              <option value="BT">BT</option>
              <option value="MT">MT</option>
              <option value="BT_MT">BT + MT</option>
            </select>
          </label>
          <label>
            Valide du
            <input type="date" name="anmeValidFrom" defaultValue={company.anmeValidFrom} required />
          </label>
          <label>
            Valide jusqu&apos;au
            <input type="date" name="anmeValidTo" defaultValue={company.anmeValidTo} required />
            <span className="hint">Une accréditation expirée bloque la génération (contrôle C22).</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Valeurs par défaut des nouveaux projets</legend>
        <div className="form-grid">
          <label>
            Tmin (°C)
            <input type="number" step="any" name="defaultTMinC" defaultValue={company.defaultTMinC} required />
          </label>
          <label>
            Tmax cellule (°C)
            <input type="number" step="any" name="defaultTMaxC" defaultValue={company.defaultTMaxC} required />
          </label>
          <label>
            Chute de tension max (%)
            <input type="number" step="any" name="defaultMaxVoltageDropPct" defaultValue={company.defaultMaxVoltageDropPct} required />
          </label>
          <label>
            Résistance de terre cible (Ω)
            <input type="number" step="any" name="defaultEarthResistanceTargetOhm" defaultValue={company.defaultEarthResistanceTargetOhm ?? ''} />
          </label>
          <label>
            Vitesse de vent de calcul (km/h)
            <input type="number" step="any" name="defaultDesignWindSpeedKmh" defaultValue={company.defaultDesignWindSpeedKmh} required />
          </label>
          <label>
            cos φ
            <input type="number" step="any" name="defaultCosPhi" defaultValue={company.defaultCosPhi} required />
          </label>
        </div>
      </fieldset>

      {state?.error && <p role="alert">{state.error}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
