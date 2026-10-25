import type { Spd } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The surge protective device characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function SpdFields({ item }: { item?: Spd | undefined }): React.JSX.Element {
  return (
    <>
      <Label>
        Marque <Input name="brand" defaultValue={item?.brand} required />
      </Label>
      <Label>
        Modèle <Input name="model" defaultValue={item?.model} required />
      </Label>
      <Label>
        Côté
        <Select name="side" required defaultValue={item?.side ?? 'DC'}>
          <option value="DC">DC</option>
          <option value="AC">AC</option>
        </Select>
      </Label>
      <Label>
        Type <Input type="number" name="type" defaultValue={item?.type} required />
      </Label>
      <Label>
        Nombre de pôles <Input type="number" name="poles" defaultValue={item?.poles} required />
      </Label>
      <Label>
        Tension de service Uc (V) <Input type="number" name="ucV" step="0.01" defaultValue={item?.ucV} required />
      </Label>
      <Label>
        Niveau de protection Up (kV) <Input type="number" name="upKV" step="0.01" defaultValue={item?.upKV} required />
      </Label>
      <Label>
        Courant nominal In (kA) <Input type="number" name="inKA" step="0.01" defaultValue={item?.inKA} required />
      </Label>
      <Label>
        Courant max Imax (kA) <Input type="number" name="imaxKA" step="0.01" defaultValue={item?.imaxKA} required />
      </Label>
      <Label>
        Courant de court-circuit PV Iscpv (kA, optionnel){' '}
        <Input type="number" name="iscpvKA" step="0.01" defaultValue={item?.iscpvKA ?? undefined} />
      </Label>
      <HomologationFields item={item} />
    </>
  );
}
