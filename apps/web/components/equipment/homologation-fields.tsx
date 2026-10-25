
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';interface Homologated {
  homologationReference: string | null;
  homologationValidTo: Date | null;
}

export function toDateInputValue(date: Date | null | undefined): string | undefined {
  return date ? date.toISOString().slice(0, 10) : undefined;
}

/** Homologation reference and end of validity, shared by every protection, cable and accessory form. */
export function HomologationFields({ item }: { item?: Homologated | undefined }): React.JSX.Element {
  return (
    <>
      <Label>
        Référence d&apos;homologation (optionnel){' '}
        <Input name="homologationReference" defaultValue={item?.homologationReference ?? undefined} />
      </Label>
      <Label>
        Homologation valide jusqu&apos;au (optionnel){' '}
        <Input type="date" name="homologationValidTo" defaultValue={toDateInputValue(item?.homologationValidTo)} />
      </Label>
    </>
  );
}
