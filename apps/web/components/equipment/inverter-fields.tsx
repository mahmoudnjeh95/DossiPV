import type { Inverter } from '@dossipv/db';

/** The inverter characteristics, shared by the super-admin catalog and the installer's own equipment. */
export function InverterFields({ item }: { item?: Inverter | undefined }): React.JSX.Element {
  return (
    <>
      <label>
        Marque <input name="brand" defaultValue={item?.brand} required />
      </label>
      <label>
        Modèle <input name="model" defaultValue={item?.model} required />
      </label>
      <label>
        Phases
        <select name="phases" required defaultValue={item?.phases ?? 1}>
          <option value={1}>Monophasé</option>
          <option value={3}>Triphasé</option>
        </select>
      </label>
      <label>
        Puissance AC nominale (W) <input type="number" name="pacW" step="0.01" defaultValue={item?.pacW} required />
      </label>
      <label>
        Puissance apparente max (VA) <input type="number" name="sacVA" step="0.01" defaultValue={item?.sacVA} required />
      </label>
      <label>
        Tension DC max (V) <input type="number" name="vdcMaxV" step="0.01" defaultValue={item?.vdcMaxV} required />
      </label>
      <label>
        Tension MPPT min (V) <input type="number" name="mpptMinV" step="0.01" defaultValue={item?.mpptMinV} required />
      </label>
      <label>
        Tension MPPT max (V) <input type="number" name="mpptMaxV" step="0.01" defaultValue={item?.mpptMaxV} required />
      </label>
      <label>
        Tension de démarrage (V) <input type="number" name="startUpV" step="0.01" defaultValue={item?.startUpV} required />
      </label>
      <label>
        Nombre de MPPT <input type="number" name="mpptCount" defaultValue={item?.mpptCount} required />
      </label>
      <label>
        Entrées par MPPT <input type="number" name="inputsPerMppt" defaultValue={item?.inputsPerMppt} required />
      </label>
      <label>
        Courant DC max par MPPT (A){' '}
        <input type="number" name="idcMaxPerMpptA" step="0.01" defaultValue={item?.idcMaxPerMpptA} required />
      </label>
      <label>
        Courant de court-circuit max par MPPT (A){' '}
        <input type="number" name="iscMaxPerMpptA" step="0.01" defaultValue={item?.iscMaxPerMpptA} required />
      </label>
      <label>
        Tension AC nominale (V) <input type="number" name="vacNomV" step="0.01" defaultValue={item?.vacNomV} required />
      </label>
      <label>
        Plage de tension AC (optionnel) <input name="vacRangeV" defaultValue={item?.vacRangeV ?? undefined} />
      </label>
      <label>
        Courant AC max (A) <input type="number" name="iacMaxA" step="0.01" defaultValue={item?.iacMaxA} required />
      </label>
      <label className="inline">
        Sectionneur DC intégré <input type="checkbox" name="integratedDcSwitch" defaultChecked={item?.integratedDcSwitch} />
      </label>
      <label className="inline">
        Homologué STEG <input type="checkbox" name="stegApproved" defaultChecked={item?.stegApproved} />
      </label>
    </>
  );
}
