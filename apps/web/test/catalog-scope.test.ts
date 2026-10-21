import { describe, it, expect } from 'vitest';
import { catalogScope } from '../lib/project-access';

describe('catalogScope', () => {
  it('shows published shared items and every private item of the company, never shared drafts', () => {
    expect(catalogScope('company-1')).toEqual({
      OR: [{ ownerCompanyId: null, catalogStatus: 'PUBLISHED' }, { ownerCompanyId: 'company-1' }],
    });
  });
});
