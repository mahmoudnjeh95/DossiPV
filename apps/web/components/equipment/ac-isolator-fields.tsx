import type { AcIsolator } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';

/** The AC switch-disconnector characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function AcIsolatorFields({ item }: { item?: AcIsolator | undefined }): React.JSX.Element {
  return (
    <>
      <label>
        Marque <input name="brand" defaultValue={item?.brand} required />
      </label>
      <label>
        Modèle <input name="model" defaultValue={item?.model} required />
      </label>
      <label>
        Courant nominal (A) <input type="number" name="ratedCurrentA" step="0.01" defaultValue={item?.ratedCurrentA} required />
      </label>
      <HomologationFields item={item} />
    </>
  );
}
