import { describe, it, expect } from 'vitest';
import { getMonthStart } from '../app/admin/(protected)/page';

describe('getMonthStart', () => {
  it("returns the first instant of the given date's month", () => {
    const result = getMonthStart(new Date('2026-10-15T13:45:00Z'));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9); // October is month index 9
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('crosses a year boundary correctly for January', () => {
    const result = getMonthStart(new Date('2027-01-05T00:00:00Z'));
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });
});
