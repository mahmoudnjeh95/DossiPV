import { describe, it, expect } from 'vitest';
import { libraryScope } from '../lib/project-access';

describe('libraryScope', () => {
  it('limits equipment to the items the company selected into its library', () => {
    expect(libraryScope('company-1')).toEqual({ libraryItems: { some: { companyId: 'company-1' } } });
  });
});
