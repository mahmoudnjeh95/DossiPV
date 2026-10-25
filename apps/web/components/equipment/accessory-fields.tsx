import type { Accessory } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The accessory characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function AccessoryFields({ item }: { item?: Accessory | undefined }): React.JSX.Element {
  return (
    <>
      <Label>
        Marque <Input name="brand" defaultValue={item?.brand} required />
      </Label>
      <Label>
        Modèle <Input name="model" defaultValue={item?.model} required />
      </Label>
      <Label>
        Type
        <Select name="kind" required defaultValue={item?.kind ?? 'MC4_CONNECTOR'}>
          <option value="MC4_CONNECTOR">Connecteur MC4</option>
          <option value="DISTRIBUTION_BLOCK">Bornier de répartition</option>
          <option value="CABLE_TRAY">Chemin de câbles</option>
          <option value="DC_ENCLOSURE">Coffret DC</option>
          <option value="AC_ENCLOSURE">Coffret AC</option>
          <option value="EARTH_ROD">Piquet de terre</option>
          <option value="OTHER">Autre</option>
        </Select>
      </Label>
      <Label>
        Spécification (optionnel) <Input name="spec" defaultValue={item?.spec ?? undefined} />
      </Label>
      <HomologationFields item={item} />
    </>
  );
}
