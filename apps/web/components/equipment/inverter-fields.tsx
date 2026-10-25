import type { Inverter } from '@dossipv/db';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The inverter characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function InverterFields({ item }: { item?: Inverter | undefined }): React.JSX.Element {
  return (
    <>
      <Label>
        Marque <Input name="brand" placeholder="ex. Huawei" defaultValue={item?.brand} required />
      </Label>
      <Label>
        Modèle <Input name="model" placeholder="ex. SUN2000-5KTL-L1" defaultValue={item?.model} required />
      </Label>
      <Label>
        Phases
        <Select name="phases" required defaultValue={item?.phases ?? 1}>
          <option value={1}>Monophasé</option>
          <option value={3}>Triphasé</option>
        </Select>
      </Label>
      <Label>
        Puissance AC nominale (W) <Input type="number" name="pacW" placeholder="ex. 5000" step="0.01" defaultValue={item?.pacW} required />
      </Label>
      <Label>
        Puissance apparente max (VA) <Input type="number" name="sacVA" placeholder="ex. 5000" step="0.01" defaultValue={item?.sacVA} required />
      </Label>
      <Label>
        Tension DC max (V) <Input type="number" name="vdcMaxV" placeholder="ex. 600" step="0.01" defaultValue={item?.vdcMaxV} required />
      </Label>
      <Label>
        Tension MPPT min (V) <Input type="number" name="mpptMinV" placeholder="ex. 90" step="0.01" defaultValue={item?.mpptMinV} required />
      </Label>
      <Label>
        Tension MPPT max (V) <Input type="number" name="mpptMaxV" placeholder="ex. 560" step="0.01" defaultValue={item?.mpptMaxV} required />
      </Label>
      <Label>
        Tension de démarrage (V) <Input type="number" name="startUpV" placeholder="ex. 100" step="0.01" defaultValue={item?.startUpV} required />
      </Label>
      <Label>
        Nombre de MPPT <Input type="number" name="mpptCount" placeholder="ex. 2" defaultValue={item?.mpptCount} required />
      </Label>
      <Label>
        Entrées par MPPT <Input type="number" name="inputsPerMppt" placeholder="ex. 1" defaultValue={item?.inputsPerMppt} required />
      </Label>
      <Label>
        Courant DC max par MPPT (A){' '}
        <Input type="number" name="idcMaxPerMpptA" placeholder="ex. 12.5" step="0.01" defaultValue={item?.idcMaxPerMpptA} required />
      </Label>
      <Label>
        Courant de court-circuit max par MPPT (A){' '}
        <Input type="number" name="iscMaxPerMpptA" placeholder="ex. 18" step="0.01" defaultValue={item?.iscMaxPerMpptA} required />
      </Label>
      <Label>
        Tension AC nominale (V) <Input type="number" name="vacNomV" placeholder="ex. 230" step="0.01" defaultValue={item?.vacNomV} required />
      </Label>
      <Label>
        Plage de tension AC (optionnel) <Input name="vacRangeV" placeholder="ex. 180-270" defaultValue={item?.vacRangeV ?? undefined} />
      </Label>
      <Label>
        Courant AC max (A) <Input type="number" name="iacMaxA" placeholder="ex. 21.7" step="0.01" defaultValue={item?.iacMaxA} required />
      </Label>
      <Label inline>
        Sectionneur DC intégré <Input type="checkbox" name="integratedDcSwitch" defaultChecked={item?.integratedDcSwitch} />
      </Label>
      <Label inline>
        Homologué STEG <Input type="checkbox" name="stegApproved" defaultChecked={item?.stegApproved} />
      </Label>
    </>
  );
}
