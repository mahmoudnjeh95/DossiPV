import type { DcFuse } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The DC fuse characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function DcFuseFields({ item }: { item?: DcFuse | undefined }): React.JSX.Element {
  return (
    <>
      <Label>
        Marque <Input name="brand" defaultValue={item?.brand} required />
      </Label>
      <Label>
        Modèle <Input name="model" defaultValue={item?.model} required />
      </Label>
      <Label>
        Tension nominale (V) <Input type="number" name="ratedVoltageV" step="0.01" defaultValue={item?.ratedVoltageV} required />
      </Label>
      <Label>
        Courant nominal (A) <Input type="number" name="ratedCurrentA" step="0.01" defaultValue={item?.ratedCurrentA} required />
      </Label>
      <HomologationFields item={item} />
    </>
  );
}
