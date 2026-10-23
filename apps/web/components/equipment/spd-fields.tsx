import type { Spd } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';

/** The surge protective device characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function SpdFields({ item }: { item?: Spd | undefined }): React.JSX.Element {
  return (
    <>
      <label>
        Marque <input name="brand" defaultValue={item?.brand} required />
      </label>
      <label>
        Modèle <input name="model" defaultValue={item?.model} required />
      </label>
      <label>
        Côté
        <select name="side" required defaultValue={item?.side ?? 'DC'}>
          <option value="DC">DC</option>
          <option value="AC">AC</option>
        </select>
      </label>
      <label>
        Type <input type="number" name="type" defaultValue={item?.type} required />
      </label>
      <label>
        Nombre de pôles <input type="number" name="poles" defaultValue={item?.poles} required />
      </label>
      <label>
        Tension de service Uc (V) <input type="number" name="ucV" step="0.01" defaultValue={item?.ucV} required />
      </label>
      <label>
        Niveau de protection Up (kV) <input type="number" name="upKV" step="0.01" defaultValue={item?.upKV} required />
      </label>
      <label>
        Courant nominal In (kA) <input type="number" name="inKA" step="0.01" defaultValue={item?.inKA} required />
      </label>
      <label>
        Courant max Imax (kA) <input type="number" name="imaxKA" step="0.01" defaultValue={item?.imaxKA} required />
      </label>
      <label>
        Courant de court-circuit PV Iscpv (kA, optionnel){' '}
        <input type="number" name="iscpvKA" step="0.01" defaultValue={item?.iscpvKA ?? undefined} />
      </label>
      <HomologationFields item={item} />
    </>
  );
}
