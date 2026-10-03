import { describe, it, expect } from 'vitest';
import { parseJobSnapshot } from '../src/job-snapshot';

const validSnapshot = {
  version: 1,
  projectId: 'project-1',
  companyId: 'company-1',
  engineInput: { array: [], dcFuse: null, acIsolator: null },
  projectMeta: { moduleBrandModel: 'X', inverterBrandModel: 'Y', gridType: 'TT', mountingType: 'ROOF', structureMaterial: 'ALUMINUM', earthRodCount: 1 },
  client: { fullName: 'Ahmed', address: 'Tunis', stegReference: 'STEG-1' },
  cableRuns: [],
};

describe('parseJobSnapshot', () => {
  it('parses a valid snapshot into its typed shape', () => {
    const result = parseJobSnapshot(validSnapshot);
    expect(result?.projectId).toBe('project-1');
    expect(result?.engineInput).toEqual({ array: [], dcFuse: null, acIsolator: null });
  });

  it('returns null (never throws) for null input', () => {
    expect(parseJobSnapshot(null)).toBeNull();
  });

  it('returns null (never throws) for a string', () => {
    expect(parseJobSnapshot('not an object')).toBeNull();
  });

  it('returns null for an object missing required fields', () => {
    expect(parseJobSnapshot({ version: 1, projectId: 'p1' })).toBeNull();
  });

  it('returns null for an object with the wrong version number', () => {
    expect(parseJobSnapshot({ ...validSnapshot, version: 2 })).toBeNull();
  });
});
