'use client';

import { useActionState } from 'react';
import { saveCompanyAction, type SaveCompanyActionState } from './actions';
import { ANME_AGREEMENT_REQUIRED_MESSAGE } from '../../../lib/labels';

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
  defaultMaxAcVoltageDropPct: number;
  defaultEarthResistanceTargetOhm: number | null;
  defaultDesignWindSpeedKmh: number;
  defaultCosPhi: number;
  dossierPrefix: string | null;
  /** The number the next first generation takes (dossierCounter + 1). */
  dossierNextNumber: number;
  hasLogo: boolean;
  hasAnmeCertificate: boolean;
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
          <label>
            Logo (PNG ou JPEG)
            <input type="file" name="logo" accept="image/png,image/jpeg" />
            <span className="hint">
              {company.hasLogo ? 'Un logo est déjà enregistré ; choisir un fichier le remplace.' : 'Imprimé sur chaque page du dossier généré.'}
            </span>
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
          <label>
            Attestation d&apos;agrément ANME (PDF ou image) <span className="badge badge-danger">obligatoire</span>
            <input type="file" name="anmeCertificate" accept="application/pdf,image/png,image/jpeg" />
            {company.hasAnmeCertificate ? (
              <span className="hint">Une attestation est déjà enregistrée ; choisir un fichier la remplace. Elle ouvre l&apos;annexe N°1 du dossier.</span>
            ) : (
              <span className="hint" role="alert">
                {ANME_AGREEMENT_REQUIRED_MESSAGE}
              </span>
            )}
          </label>
        </div>
      </fieldset>

      <fieldset className="card">
        <legend>Numérotation des dossiers</legend>
        <div className="form-grid">
          <label>
            Préfixe de numérotation des dossiers
            <input type="text" name="dossierPrefix" defaultValue={company.dossierPrefix ?? ''} maxLength={20} />
          </label>
          <label>
            Prochain numéro de dossier
            <input type="number" name="dossierNextNumber" min={1} step={1} defaultValue={company.dossierNextNumber} required />
            <input type="hidden" name="dossierNextNumberShown" value={company.dossierNextNumber} />
          </label>
        </div>
        <p className="hint">Exemple : préfixe 434 et prochain numéro 303 donnent « 434 - 303 ».</p>
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
            Chute de tension maximale DC (%)
            <input type="number" step="any" min={0} max={10} name="defaultMaxVoltageDropPct" defaultValue={company.defaultMaxVoltageDropPct} required />
          </label>
          <label>
            Chute de tension maximale AC (%)
            <input type="number" step="any" min={0} max={10} name="defaultMaxAcVoltageDropPct" defaultValue={company.defaultMaxAcVoltageDropPct} required />
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
