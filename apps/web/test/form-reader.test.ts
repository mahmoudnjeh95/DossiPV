import { describe, it, expect } from 'vitest';
import { FormReader } from '../lib/form-reader';

function form(entries: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe('FormReader', () => {
  it('reads required and optional text, trimming and turning empty into null', () => {
    const reader = new FormReader(form({ a: '  hello ', b: '   ' }));
    expect(reader.text('a', 'A')).toBe('hello');
    expect(reader.optionalText('b', 'B')).toBeNull();
    expect(reader.hasErrors).toBe(false);
  });

  it('treats a File value as a missing field rather than crashing', () => {
    const reader = new FormReader(form({ a: new File(['x'], 'x.txt') }));
    expect(reader.text('a', 'A')).toBe('');
    expect(reader.errors).toEqual(['A : champ obligatoire.']);
  });

  it('parses numbers with bounds and collects every error', () => {
    const reader = new FormReader(form({ n: '12.5', m: 'abc', k: '-1' }));
    expect(reader.number('n', 'N')).toBe(12.5);
    expect(reader.number('m', 'M')).toBe(0);
    expect(reader.integer('k', 'K', { min: 0 })).toBe(-1);
    expect(reader.errors).toEqual(['M : valeur numérique obligatoire.', 'K : doit être ≥ 0.']);
  });

  it('validates enumerated values and checkboxes', () => {
    const reader = new FormReader(form({ e: 'BT', f: 'NOPE', c: 'on' }));
    expect(reader.oneOf('e', 'E', ['BT', 'MT'])).toBe('BT');
    expect(reader.oneOf('f', 'F', ['BT', 'MT'])).toBe('BT');
    expect(reader.optionalOneOf('g', 'G', ['BT'])).toBeNull();
    expect(reader.boolean('c')).toBe(true);
    expect(reader.boolean('missing')).toBe(false);
    expect(reader.errors).toEqual(['F : valeur invalide.']);
  });
});
