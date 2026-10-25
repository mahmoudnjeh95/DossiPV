import type { AcBreaker } from '@dossipv/db';
import { RCD_TYPE_OPTIONS } from '../../lib/labels';
import { HomologationFields } from './homologation-fields';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The AC breaker characteristics (with its optional differential function), shared by the super-admin catalog and the installer's own equipment. */
export function AcBreakerFields({ item }: { item?: AcBreaker | undefined }): React.JSX.Element {
  return (
    <>
      <Label>
        Marque <Input name="brand" defaultValue={item?.brand} required />
      </Label>
      <Label>
        Modèle <Input name="model" defaultValue={item?.model} required />
      </Label>
      <Label>
        Courant nominal (A) <Input type="number" name="ratedCurrentA" step="0.01" defaultValue={item?.ratedCurrentA} required />
      </Label>
      <Label>
        Courbe (optionnel) <Input name="curve" defaultValue={item?.curve ?? undefined} />
      </Label>
      <Label>
        Pouvoir de coupure (kA, optionnel){' '}
        <Input type="number" name="breakingCapacityKA" step="0.01" defaultValue={item?.breakingCapacityKA ?? undefined} />
      </Label>
      <Label>
        Sensibilité différentielle IΔn (mA, vide pour un disjoncteur sans différentiel){' '}
        <Input type="number" name="residualCurrentMA" step="1" min="1" defaultValue={item?.residualCurrentMA ?? undefined} />
      </Label>
      <Label>
        Type de différentiel{' '}
        <Select name="rcdType" defaultValue={item?.rcdType ?? ''}>
          <option value="">— Sans différentiel —</option>
          {RCD_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Label>
      <HomologationFields item={item} />
    </>
  );
}
