import type { Cable, CableSection } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';
import { SectionsField } from './sections-field';

/** The cable characteristics and its sections, shared by the super-admin catalog and the installer's own equipment. */
export function CableFields({ item }: { item?: (Cable & { sections: CableSection[] }) | undefined }): React.JSX.Element {
  const initialRows = item?.sections.map((section) => ({
    sectionMm2: String(section.sectionMm2),
    izA: String(section.izA),
    izReferenceMethod: section.izReferenceMethod,
  }));

  return (
    <>
      <label>
        Marque <input name="brand" defaultValue={item?.brand} required />
      </label>
      <label>
        Modèle <input name="model" defaultValue={item?.model} required />
      </label>
      <label>
        Usage
        <select name="usage" required defaultValue={item?.usage ?? 'DC_SOLAR'}>
          <option value="DC_SOLAR">DC solaire</option>
          <option value="AC">AC</option>
          <option value="EARTH">Terre</option>
        </select>
      </label>
      <label>
        Conducteur <input name="conductor" defaultValue={item?.conductor} required />
      </label>
      <label>
        Isolation <input name="insulation" defaultValue={item?.insulation} required />
      </label>
      <label>
        Norme (optionnel) <input name="standard" defaultValue={item?.standard ?? undefined} />
      </label>
      <SectionsField initialRows={initialRows} />
      <HomologationFields item={item} />
    </>
  );
}
