import { describe, it, expect } from 'vitest';
import type { StegBillReading } from '@dossipv/bill-reader';
import { CLIENT_NAME_PLACEHOLDER, clientIdentityNeeds } from '../lib/client-identity';

const reading = (overrides: Partial<StegBillReading>): StegBillReading =>
  ({
    clientName: 'MR TEST CLIENT',
    stegReference: '123456',
    subscribedPowerKVA: 3,
    totalElectricityKWh: 1200,
    monthsBilled: 3,
    lines: [],
    ...overrides,
  }) as StegBillReading;

describe('clientIdentityNeeds', () => {
  it('flags the placeholder name', () => {
    expect(clientIdentityNeeds({ fullName: CLIENT_NAME_PLACEHOLDER, reading: null, cinFileId: 'f1' }).name).toBe(true);
    expect(clientIdentityNeeds({ fullName: '  ', reading: null, cinFileId: 'f1' }).name).toBe(true);
  });

  it('does not flag a real name', () => {
    expect(clientIdentityNeeds({ fullName: 'MR TEST CLIENT', reading: null, cinFileId: 'f1' }).name).toBe(false);
  });

  it('flags a missing CIN photo only', () => {
    expect(clientIdentityNeeds({ fullName: 'MR TEST CLIENT', reading: null, cinFileId: null }).cinPhoto).toBe(true);
    expect(clientIdentityNeeds({ fullName: 'MR TEST CLIENT', reading: null, cinFileId: 'f1' }).cinPhoto).toBe(false);
  });

  it('lists the missing bill fields, none without a reading', () => {
    expect(clientIdentityNeeds({ fullName: 'X Y', reading: null, cinFileId: 'f1' }).missingBillFields).toEqual([]);
    const needs = clientIdentityNeeds({ fullName: CLIENT_NAME_PLACEHOLDER, reading: reading({ clientName: null }), cinFileId: 'f1' });
    expect(needs.missingBillFields).toContain('clientName');
  });
});
