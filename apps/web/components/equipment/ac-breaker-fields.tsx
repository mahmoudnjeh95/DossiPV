import type { AcBreaker } from '@dossipv/db';
import { RCD_TYPE_OPTIONS } from '../../lib/labels';
import { HomologationFields } from './homologation-fields';

/** The AC breaker characteristics (with its optional differential function), shared by the super-admin catalog and the installer's own equipment. */
export function AcBreakerFields({ item }: { item?: AcBreaker | undefined }): React.JSX.Element {
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
      <label>
        Courbe (optionnel) <input name="curve" defaultValue={item?.curve ?? undefined} />
      </label>
      <label>
        Pouvoir de coupure (kA, optionnel){' '}
        <input type="number" name="breakingCapacityKA" step="0.01" defaultValue={item?.breakingCapacityKA ?? undefined} />
      </label>
      <label>
        Sensibilité différentielle IΔn (mA, vide pour un disjoncteur sans différentiel){' '}
        <input type="number" name="residualCurrentMA" step="1" min="1" defaultValue={item?.residualCurrentMA ?? undefined} />
      </label>
      <label>
        Type de différentiel{' '}
        <select name="rcdType" defaultValue={item?.rcdType ?? ''}>
          <option value="">— Sans différentiel —</option>
          {RCD_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <HomologationFields item={item} />
    </>
  );
}
