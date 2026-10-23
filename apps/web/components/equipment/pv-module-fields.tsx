import type { PvModule } from '@dossipv/db';

/** The PV module characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function PvModuleFields({ item }: { item?: PvModule | undefined }): React.JSX.Element {
  return (
    <>
      <label>
        Marque <input name="brand" defaultValue={item?.brand} required />
      </label>
      <label>
        Modèle <input name="model" defaultValue={item?.model} required />
      </label>
      <label>
        Puissance Pmax (Wc) <input type="number" name="pmaxW" step="0.01" defaultValue={item?.pmaxW} required />
      </label>
      <label>
        Tension Vmp (V) <input type="number" name="vmpV" step="0.01" defaultValue={item?.vmpV} required />
      </label>
      <label>
        Courant Imp (A) <input type="number" name="impA" step="0.01" defaultValue={item?.impA} required />
      </label>
      <label>
        Tension Voc (V) <input type="number" name="vocV" step="0.01" defaultValue={item?.vocV} required />
      </label>
      <label>
        Courant Isc (A) <input type="number" name="iscA" step="0.01" defaultValue={item?.iscA} required />
      </label>
      <label>
        Coeff. temp. Voc (%/°C){' '}
        <input type="number" name="tempCoeffVocPct" step="0.001" defaultValue={item?.tempCoeffVocPct} required />
      </label>
      <label>
        Coeff. temp. Isc (%/°C){' '}
        <input type="number" name="tempCoeffIscPct" step="0.001" defaultValue={item?.tempCoeffIscPct} required />
      </label>
      <label>
        Coeff. temp. Pmax (%/°C){' '}
        <input type="number" name="tempCoeffPmaxPct" step="0.001" defaultValue={item?.tempCoeffPmaxPct} required />
      </label>
      <label>
        Coeff. temp. Vmp (%/°C, optionnel){' '}
        <input type="number" name="tempCoeffVmpPct" step="0.001" defaultValue={item?.tempCoeffVmpPct ?? undefined} />
      </label>
      <label>
        Courant inverse max Irm (A) <input type="number" name="irmA" step="0.01" defaultValue={item?.irmA} required />
      </label>
      <label>
        Tension système max (V){' '}
        <input type="number" name="maxSystemVoltageV" step="0.01" defaultValue={item?.maxSystemVoltageV} required />
      </label>
      <label className="inline">
        Bifacial <input type="checkbox" name="bifacial" defaultChecked={item?.bifacial} />
      </label>
      <label>
        Gain bifacial (%, optionnel){' '}
        <input type="number" name="bifacialGainPct" step="0.01" defaultValue={item?.bifacialGainPct ?? undefined} />
      </label>
      <label>
        Longueur (mm) <input type="number" name="lengthMm" step="0.1" defaultValue={item?.lengthMm} required />
      </label>
      <label>
        Largeur (mm) <input type="number" name="widthMm" step="0.1" defaultValue={item?.widthMm} required />
      </label>
      <label>
        Poids (kg) <input type="number" name="weightKg" step="0.01" defaultValue={item?.weightKg} required />
      </label>
      <label>
        NOCT (°C, optionnel) <input type="number" name="noctC" step="0.1" defaultValue={item?.noctC ?? undefined} />
      </label>
    </>
  );
}
