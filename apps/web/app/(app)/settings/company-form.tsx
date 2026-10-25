'use client';

import { useKeepFormValues } from '../../../lib/keep-form-values';
import { saveCompanyAction, type SaveCompanyActionState } from './actions';
import { ANME_AGREEMENT_REQUIRED_MESSAGE } from '../../../lib/labels';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const { state, formAction, pending, formRef, errorRef } = useKeepFormValues<SaveCompanyActionState>(saveCompanyAction);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {state?.error && <p ref={errorRef} role="alert">{state.error}</p>}
      <Card as="fieldset">
        <legend>Identité</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Raison sociale
            <Input type="text" name="name" defaultValue={company.name} required maxLength={200} />
          </Label>
          <Label>
            Nom court
            <Input type="text" name="shortName" defaultValue={company.shortName ?? ''} maxLength={50} />
          </Label>
          <Label>
            Slogan
            <Input type="text" name="slogan" defaultValue={company.slogan ?? ''} maxLength={200} />
          </Label>
          <Label>
            Adresse
            <Input type="text" name="address" defaultValue={company.address} required maxLength={300} />
          </Label>
          <Label>
            Téléphone
            <Input type="tel" name="phone" defaultValue={company.phone} required maxLength={30} />
          </Label>
          <Label>
            Email de contact
            <Input type="email" name="email" defaultValue={company.email} required maxLength={200} />
          </Label>
          <Label>
            Matricule fiscal
            <Input type="text" name="taxId" defaultValue={company.taxId ?? ''} maxLength={50} />
          </Label>
          <Label>
            Registre de commerce
            <Input type="text" name="commercialRegister" defaultValue={company.commercialRegister ?? ''} maxLength={50} />
          </Label>
          <Label>
            Représentant légal
            <Input type="text" name="legalRepFullName" defaultValue={company.legalRepFullName} required maxLength={200} />
          </Label>
          <Label>
            Fonction
            <Input type="text" name="legalRepRole" defaultValue={company.legalRepRole} required maxLength={100} />
          </Label>
          <Label>
            Logo (PNG ou JPEG)
            <Input type="file" name="logo" accept="image/png,image/jpeg" />
            <span className="text-[0.8rem] font-normal text-app-muted">
              {company.hasLogo ? 'Un logo est déjà enregistré ; choisir un fichier le remplace.' : 'Imprimé sur chaque page du dossier généré.'}
            </span>
          </Label>
        </div>
      </Card>

      <Card as="fieldset">
        <legend>Accréditation ANME</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Code ANME
            <Input type="text" name="anmeCode" defaultValue={company.anmeCode} required maxLength={50} />
          </Label>
          <Label>
            Référence
            <Input type="text" name="anmeReference" defaultValue={company.anmeReference ?? ''} maxLength={100} />
          </Label>
          <Label>
            Catégorie
            <Select name="anmeCategory" defaultValue={company.anmeCategory}>
              <option value="BT">BT</option>
              <option value="MT">MT</option>
              <option value="BT_MT">BT + MT</option>
            </Select>
          </Label>
          <Label>
            Valide du
            <Input type="date" name="anmeValidFrom" defaultValue={company.anmeValidFrom} required />
          </Label>
          <Label>
            Valide jusqu&apos;au
            <Input type="date" name="anmeValidTo" defaultValue={company.anmeValidTo} required />
            <span className="text-[0.8rem] font-normal text-app-muted">Une accréditation expirée bloque la génération (contrôle C22).</span>
          </Label>
          <Label>
            Attestation d&apos;agrément ANME (PDF ou image) <Badge variant="danger">obligatoire</Badge>
            <Input type="file" name="anmeCertificate" accept="application/pdf,image/png,image/jpeg" />
            {company.hasAnmeCertificate ? (
              <span className="text-[0.8rem] font-normal text-app-muted">Une attestation est déjà enregistrée ; choisir un fichier la remplace. Elle ouvre l&apos;annexe N°1 du dossier.</span>
            ) : (
              <span className="text-[0.8rem] font-normal text-app-muted" role="alert">
                {ANME_AGREEMENT_REQUIRED_MESSAGE}
              </span>
            )}
          </Label>
        </div>
      </Card>

      <Card as="fieldset">
        <legend>Numérotation des dossiers</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Préfixe de numérotation des dossiers
            <Input type="text" name="dossierPrefix" defaultValue={company.dossierPrefix ?? ''} maxLength={20} />
          </Label>
          <Label>
            Prochain numéro de dossier
            <Input type="number" name="dossierNextNumber" min={1} step={1} defaultValue={company.dossierNextNumber} required />
            <Input type="hidden" name="dossierNextNumberShown" value={company.dossierNextNumber} />
          </Label>
        </div>
        <p className="text-[0.8rem] font-normal text-app-muted">Exemple : préfixe 434 et prochain numéro 303 donnent « 434 - 303 ».</p>
      </Card>

      <Card as="fieldset">
        <legend>Valeurs par défaut des nouveaux projets</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 max-sm:grid-cols-1">
          <Label>
            Tmin (°C)
            <Input type="number" step="any" name="defaultTMinC" defaultValue={company.defaultTMinC} required />
          </Label>
          <Label>
            Tmax cellule (°C)
            <Input type="number" step="any" name="defaultTMaxC" defaultValue={company.defaultTMaxC} required />
          </Label>
          <Label>
            Chute de tension maximale DC (%)
            <Input type="number" step="any" min={0} max={10} name="defaultMaxVoltageDropPct" defaultValue={company.defaultMaxVoltageDropPct} required />
          </Label>
          <Label>
            Chute de tension maximale AC (%)
            <Input type="number" step="any" min={0} max={10} name="defaultMaxAcVoltageDropPct" defaultValue={company.defaultMaxAcVoltageDropPct} required />
          </Label>
          <Label>
            Résistance de terre cible (Ω)
            <Input type="number" step="any" name="defaultEarthResistanceTargetOhm" defaultValue={company.defaultEarthResistanceTargetOhm ?? ''} />
          </Label>
          <Label>
            Vitesse de vent de calcul (km/h)
            <Input type="number" step="any" name="defaultDesignWindSpeedKmh" defaultValue={company.defaultDesignWindSpeedKmh} required />
          </Label>
          <Label>
            cos φ
            <Input type="number" step="any" name="defaultCosPhi" defaultValue={company.defaultCosPhi} required />
          </Label>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}
