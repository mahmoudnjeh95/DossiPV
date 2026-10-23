import type { DcFuse } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';

/** The DC fuse characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function DcFuseFields({ item }: { item?: DcFuse | undefined }): React.JSX.Element {
  return (
    <>
      <label>
        Marque <input name="brand" defaultValue={item?.brand} required />
      </label>
      <label>
        Modèle <input name="model" defaultValue={item?.model} required />
      </label>
      <label>
        Tension nominale (V) <input type="number" name="ratedVoltageV" step="0.01" defaultValue={item?.ratedVoltageV} required />
      </label>
      <label>
        Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" defaultValue={item?.ratedCurrentA} required />
      </label>
      <HomologationFields item={item} />
    </>
  );
}
