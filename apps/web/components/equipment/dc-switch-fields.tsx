import type { DcSwitch } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';

/** The DC switch-disconnector characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function DcSwitchFields({ item }: { item?: DcSwitch | undefined }): React.JSX.Element {
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
      <label>
        Nombre de pôles <input type="number" name="poles" defaultValue={item?.poles} required />
      </label>
      <HomologationFields item={item} />
    </>
  );
}
