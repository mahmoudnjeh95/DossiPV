'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SectionRow {
  sectionMm2: string;
  izA: string;
  izReferenceMethod: string;
}

const EMPTY_ROW: SectionRow = { sectionMm2: '', izA: '', izReferenceMethod: '' };

export function SectionsField({ initialRows }: { initialRows?: SectionRow[] | undefined }): React.JSX.Element {
  const [rows, setRows] = useState<SectionRow[]>(initialRows && initialRows.length > 0 ? initialRows : [EMPTY_ROW]);

  const serialized = JSON.stringify(
    rows
      .filter((row) => row.sectionMm2 !== '' && row.izA !== '' && row.izReferenceMethod !== '')
      .map((row) => ({
        sectionMm2: Number(row.sectionMm2),
        izA: Number(row.izA),
        izReferenceMethod: row.izReferenceMethod,
      })),
  );

  function updateRow(index: number, field: keyof SectionRow, value: string): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow(): void {
    setRows((prev) => [...prev, EMPTY_ROW]);
  }

  function removeRow(index: number): void {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>Sections de câble</legend>
      <Input type="hidden" name="sections" value={serialized} />
      {rows.map((row, index) => (
        <div key={index}>
          <Label>
            Section (mm²){' '}
            <Input
              type="number"
              step="0.01"
              value={row.sectionMm2}
              onChange={(e) => updateRow(index, 'sectionMm2', e.target.value)}
            />
          </Label>
          <Label>
            Iz (A){' '}
            <Input type="number" step="0.01" value={row.izA} onChange={(e) => updateRow(index, 'izA', e.target.value)} />
          </Label>
          <Label>
            Mode de pose{' '}
            <Input value={row.izReferenceMethod} onChange={(e) => updateRow(index, 'izReferenceMethod', e.target.value)} />
          </Label>
          <Button type="button" onClick={() => removeRow(index)} disabled={rows.length === 1}>
            Retirer
          </Button>
        </div>
      ))}
      <Button type="button" onClick={addRow}>
        Ajouter une section
      </Button>
    </fieldset>
  );
}
