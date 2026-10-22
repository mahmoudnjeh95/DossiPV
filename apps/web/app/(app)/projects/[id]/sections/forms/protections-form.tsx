import type { ProjectProtections } from '@dossipv/db';
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
          <SelectField name="dcSpdId" label="Parafoudre DC" options={equipmentOptions(catalog.dcSpds)} defaultValue={protections?.dcSpdId} allowEmpty required />
          <SelectField name="dcSwitchId" label="Interrupteur-sectionneur DC" options={equipmentOptions(catalog.dcSwitches)} defaultValue={protections?.dcSwitchId} allowEmpty required />
          <SelectField
            name="dcFuseId"
            label="Fusibles DC"
            options={equipmentOptions(catalog.dcFuses)}
            defaultValue={protections?.dcFuseId}
            allowEmpty
            hint="Obligatoires seulement si le nombre de chaînes en parallèle dépasse Nc max (contrôle C08)."
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>Côté AC</legend>
        <div className="form-grid">
          <SelectField
            name="acBreakerId"
            label="Disjoncteur différentiel AC"
            options={equipmentOptions(catalog.acBreakers)}
            defaultValue={protections?.acBreakerId}
            allowEmpty
            required
            hint="Disjoncteur différentiel 30 mA de type A au minimum (contrôle C24) : un disjoncteur sans différentiel bloque la génération du dossier."
          />
          <SelectField name="acSpdId" label="Parafoudre AC" options={equipmentOptions(catalog.acSpds)} defaultValue={protections?.acSpdId} allowEmpty required />
          <SelectField
            name="acIsolatorId"
            label="Interrupteur-sectionneur général AC"
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
