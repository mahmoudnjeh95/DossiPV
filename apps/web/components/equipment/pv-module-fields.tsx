import type { PvModule } from '@dossipv/db';

/** The PV module characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function PvModuleFields({ item }: { item?: PvModule | undefined }): React.JSX.Element {
  return (
    <>
      <label>
        Marque <input name="brand" placeholder="ex. JA Solar" defaultValue={item?.brand} required />
      </label>
      <label>
        Modèle <input name="model" placeholder="ex. JAM72S30-545/MR" defaultValue={item?.model} required />
      </label>
      <label>
        Puissance Pmax (Wc) <input type="number" name="pmaxW" placeholder="ex. 545" step="0.01" defaultValue={item?.pmaxW} required />
      </label>
      <label>
        Tension Vmp (V) <input type="number" name="vmpV" placeholder="ex. 41.8" step="0.01" defaultValue={item?.vmpV} required />
      </label>
      <label>
        Courant Imp (A) <input type="number" name="impA" placeholder="ex. 13.04" step="0.01" defaultValue={item?.impA} required />
      </label>
      <label>
        Tension Voc (V) <input type="number" name="vocV" placeholder="ex. 49.7" step="0.01" defaultValue={item?.vocV} required />
      </label>
      <label>
        Courant Isc (A) <input type="number" name="iscA" placeholder="ex. 13.9" step="0.01" defaultValue={item?.iscA} required />
      </label>
      <label>
        Coeff. temp. Voc (%/°C){' '}
        <input type="number" name="tempCoeffVocPct" placeholder="ex. -0.275" step="0.001" defaultValue={item?.tempCoeffVocPct} required />
      </label>
      <label>
        Coeff. temp. Isc (%/°C){' '}
        <input type="number" name="tempCoeffIscPct" placeholder="ex. 0.045" step="0.001" defaultValue={item?.tempCoeffIscPct} required />
      </label>
      <label>
        Coeff. temp. Pmax (%/°C){' '}
        <input type="number" name="tempCoeffPmaxPct" placeholder="ex. -0.35" step="0.001" defaultValue={item?.tempCoeffPmaxPct} required />
      </label>
      <label>
        Coeff. temp. Vmp (%/°C, optionnel){' '}
        <input type="number" name="tempCoeffVmpPct" placeholder="ex. -0.29" step="0.001" defaultValue={item?.tempCoeffVmpPct ?? undefined} />
      </label>
      <label>
        Courant inverse max Irm (A) <input type="number" name="irmA" placeholder="ex. 25" step="0.01" defaultValue={item?.irmA} required />
      </label>
      <label>
        Tension système max (V){' '}
        <input type="number" name="maxSystemVoltageV" placeholder="ex. 1500" step="0.01" defaultValue={item?.maxSystemVoltageV} required />
      </label>
      <label className="inline">
        Bifacial <input type="checkbox" name="bifacial" defaultChecked={item?.bifacial} />
      </label>
      <label>
        Gain bifacial (%, optionnel){' '}
        <input type="number" name="bifacialGainPct" placeholder="ex. 10" step="0.01" defaultValue={item?.bifacialGainPct ?? undefined} />
      </label>
      <label>
        Longueur (mm) <input type="number" name="lengthMm" placeholder="ex. 2278" step="0.1" defaultValue={item?.lengthMm} required />
      </label>
      <label>
        Largeur (mm) <input type="number" name="widthMm" placeholder="ex. 1134" step="0.1" defaultValue={item?.widthMm} required />
      </label>
      <label>
        Poids (kg) <input type="number" name="weightKg" placeholder="ex. 27.5" step="0.01" defaultValue={item?.weightKg} required />
      </label>
      <label>
        NOCT (°C, optionnel) <input type="number" name="noctC" placeholder="ex. 45" step="0.1" defaultValue={item?.noctC ?? undefined} />
      </label>
    </>
  );
}
