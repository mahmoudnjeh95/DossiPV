import type { ProjectProtections } from '@dossipv/db';
import Link from 'next/link';
import { Jargon } from '../../../../../../components/jargon';
import { SectionForm } from '../../../../../../components/section-form';
import { SelectField, equipmentOptions, type EquipmentOption } from '../../../../../../components/select-field';
import { saveProtectionsAction } from '../actions';

export interface ProtectionsCatalog {
  dcSpds: EquipmentOption[];
  acSpds: EquipmentOption[];
  dcSwitches: EquipmentOption[];
  dcFuses: EquipmentOption[];
  acBreakers: EquipmentOption[];
  acIsolators: EquipmentOption[];
}

/** Label of a field the dossier cannot do without. */
function required(label: string): React.JSX.Element {
  return (
    <>
      {label} <span className="badge badge-danger">obligatoire</span>
    </>
  );
}

/** Shown under a selector whose library list is empty: what to do, with a link to the matching catalogue type. */
function emptyLibrary(what: string, type: string): React.JSX.Element {
  return (
    <>
      Aucun {what} dans votre bibliothèque. <Link href={`/library?tab=catalogue&type=${type}`}>Ajoutez-en un depuis le catalogue partagé</Link>, ou{' '}
      <Link href="/library/new">saisissez votre propre matériel</Link>.
    </>
  );
}

export function ProtectionsForm({
  projectId,
  protections,
  catalog,
}: {
  projectId: string;
  protections: ProjectProtections | null;
  catalog: ProtectionsCatalog;
}): React.JSX.Element {
  return (
    <SectionForm action={saveProtectionsAction.bind(null, projectId)} cancelHref={`/projects/${projectId}`}>
      <fieldset>
        <legend>Côté DC</legend>
        <div className="form-grid">
          <SelectField name="dcSpdId" label={required('Parafoudre DC')} emptyMessage={emptyLibrary('parafoudre', 'SPD')} options={equipmentOptions(catalog.dcSpds)} defaultValue={protections?.dcSpdId} allowEmpty required />
          <SelectField name="dcSwitchId" label={required('Interrupteur-sectionneur DC')} emptyMessage={emptyLibrary('interrupteur-sectionneur DC', 'DC_SWITCH')} options={equipmentOptions(catalog.dcSwitches)} defaultValue={protections?.dcSwitchId} allowEmpty required />
          <SelectField
            name="dcFuseId"
            label="Fusibles DC"
            emptyMessage={emptyLibrary('fusible DC', 'DC_FUSE')}
            options={equipmentOptions(catalog.dcFuses)}
            defaultValue={protections?.dcFuseId}
            allowEmpty
            hint={<Jargon text="Obligatoires seulement si le nombre de chaînes en parallèle dépasse Nc max (contrôle C08)." />}
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>Côté AC</legend>
        <div className="form-grid">
          <SelectField
            name="acBreakerId"
            label={required('Disjoncteur différentiel AC')}
            emptyMessage={emptyLibrary('disjoncteur', 'AC_BREAKER')}
            options={equipmentOptions(catalog.acBreakers)}
            defaultValue={protections?.acBreakerId}
            allowEmpty
            required
            hint="Disjoncteur différentiel 30 mA de type A au minimum (contrôle C24) : un disjoncteur sans différentiel bloque la génération du dossier."
          />
          <SelectField name="acSpdId" label={required('Parafoudre AC')} hint="Obligatoire pour le dossier STEG : tension de service (Uc) d’au moins 253 V (contrôle C14)." emptyMessage={emptyLibrary('parafoudre AC', 'SPD')} options={equipmentOptions(catalog.acSpds)} defaultValue={protections?.acSpdId} allowEmpty required />
          <SelectField
            name="acIsolatorId"
            label="Interrupteur-sectionneur général AC"
            emptyMessage={emptyLibrary('interrupteur-sectionneur AC', 'AC_ISOLATOR')}
            options={equipmentOptions(catalog.acIsolators)}
            defaultValue={protections?.acIsolatorId}
            allowEmpty
            hint="Obligatoire dès qu'il y a plus d'un onduleur (contrôle C15)."
          />
        </div>
      </fieldset>
    </SectionForm>
  );
}
