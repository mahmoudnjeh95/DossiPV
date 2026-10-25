import type { Cable, CableSection } from '@dossipv/db';
import { HomologationFields } from './homologation-fields';
import { SectionsField } from './sections-field';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The cable characteristics and its sections, shared by the super-admin catalog and the installer's own equipment. */
export function CableFields({ item }: { item?: (Cable & { sections: CableSection[] }) | undefined }): React.JSX.Element {
  const initialRows = item?.sections.map((section) => ({
    sectionMm2: String(section.sectionMm2),
    izA: String(section.izA),
    izReferenceMethod: section.izReferenceMethod,
  }));

  return (
    <>
      <Label>
        Marque <Input name="brand" defaultValue={item?.brand} required />
      </Label>
      <Label>
        Modèle <Input name="model" defaultValue={item?.model} required />
      </Label>
      <Label>
        Usage
        <Select name="usage" required defaultValue={item?.usage ?? 'DC_SOLAR'}>
          <option value="DC_SOLAR">DC solaire</option>
          <option value="AC">AC</option>
          <option value="EARTH">Terre</option>
        </Select>
      </Label>
      <Label>
        Conducteur <Input name="conductor" defaultValue={item?.conductor} required />
      </Label>
      <Label>
        Isolation <Input name="insulation" defaultValue={item?.insulation} required />
      </Label>
      <Label>
        Norme (optionnel) <Input name="standard" defaultValue={item?.standard ?? undefined} />
      </Label>
      <SectionsField initialRows={initialRows} />
      <HomologationFields item={item} />
    </>
  );
}
