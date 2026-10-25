'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Renders N independent `<input type="file" name="extraFiles">` elements. File inputs are
 * uncontrolled in React (no `value` prop), so unlike a repeatable numeric sub-form this only
 * needs to track how many slots exist — the browser's own FormData collects every same-named
 * file input into one array on submit (`formData.getAll('extraFiles')`), which is exactly what
 * the server action already expects.
 */
export function ExtraFilesField(): React.JSX.Element {
  const [slotCount, setSlotCount] = useState(1);

  return (
    <fieldset>
      <legend>Autres pièces jointes</legend>
      {Array.from({ length: slotCount }, (_, index) => (
        <Label key={index}>
          Fichier {index + 1}
          <Input type="file" name="extraFiles" accept="application/pdf,image/png,image/jpeg" />
        </Label>
      ))}
      <Button type="button" onClick={() => setSlotCount((n) => n + 1)}>
        Ajouter un fichier
      </Button>
    </fieldset>
  );
}
