import type { PvModule } from '@dossipv/db';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The PV module characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function PvModuleFields({ item }: { item?: PvModule | undefined }): React.JSX.Element {
  return (
    <>
      <Label>
        Marque <Input name="brand" placeholder="ex. JA Solar" defaultValue={item?.brand} required />
      </Label>
      <Label>
        Modèle <Input name="model" placeholder="ex. JAM72S30-545/MR" defaultValue={item?.model} required />
      </Label>
      <Label>
        Puissance Pmax (Wc) <Input type="number" name="pmaxW" placeholder="ex. 545" step="0.01" defaultValue={item?.pmaxW} required />
      </Label>
      <Label>
        Tension Vmp (V) <Input type="number" name="vmpV" placeholder="ex. 41.8" step="0.01" defaultValue={item?.vmpV} required />
      </Label>
      <Label>
        Courant Imp (A) <Input type="number" name="impA" placeholder="ex. 13.04" step="0.01" defaultValue={item?.impA} required />
      </Label>
      <Label>
        Tension Voc (V) <Input type="number" name="vocV" placeholder="ex. 49.7" step="0.01" defaultValue={item?.vocV} required />
      </Label>
      <Label>
        Courant Isc (A) <Input type="number" name="iscA" placeholder="ex. 13.9" step="0.01" defaultValue={item?.iscA} required />
      </Label>
      <Label>
        Coeff. temp. Voc (%/°C){' '}
        <Input type="number" name="tempCoeffVocPct" placeholder="ex. -0.275" step="0.001" defaultValue={item?.tempCoeffVocPct} required />
      </Label>
      <Label>
        Coeff. temp. Isc (%/°C){' '}
        <Input type="number" name="tempCoeffIscPct" placeholder="ex. 0.045" step="0.001" defaultValue={item?.tempCoeffIscPct} required />
      </Label>
      <Label>
        Coeff. temp. Pmax (%/°C){' '}
        <Input type="number" name="tempCoeffPmaxPct" placeholder="ex. -0.35" step="0.001" defaultValue={item?.tempCoeffPmaxPct} required />
      </Label>
      <Label>
        Coeff. temp. Vmp (%/°C, optionnel){' '}
        <Input type="number" name="tempCoeffVmpPct" placeholder="ex. -0.29" step="0.001" defaultValue={item?.tempCoeffVmpPct ?? undefined} />
      </Label>
      <Label>
        Courant inverse max Irm (A) <Input type="number" name="irmA" placeholder="ex. 25" step="0.01" defaultValue={item?.irmA} required />
      </Label>
      <Label>
        Tension système max (V){' '}
        <Input type="number" name="maxSystemVoltageV" placeholder="ex. 1500" step="0.01" defaultValue={item?.maxSystemVoltageV} required />
      </Label>
      <Label inline>
        Bifacial <Input type="checkbox" name="bifacial" defaultChecked={item?.bifacial} />
      </Label>
      <Label>
        Gain bifacial (%, optionnel){' '}
        <Input type="number" name="bifacialGainPct" placeholder="ex. 10" step="0.01" defaultValue={item?.bifacialGainPct ?? undefined} />
      </Label>
      <Label>
        Longueur (mm) <Input type="number" name="lengthMm" placeholder="ex. 2278" step="0.1" defaultValue={item?.lengthMm} required />
      </Label>
      <Label>
        Largeur (mm) <Input type="number" name="widthMm" placeholder="ex. 1134" step="0.1" defaultValue={item?.widthMm} required />
      </Label>
      <Label>
        Poids (kg) <Input type="number" name="weightKg" placeholder="ex. 27.5" step="0.01" defaultValue={item?.weightKg} required />
      </Label>
      <Label>
        NOCT (°C, optionnel) <Input type="number" name="noctC" placeholder="ex. 45" step="0.1" defaultValue={item?.noctC ?? undefined} />
      </Label>
    </>
  );
}
