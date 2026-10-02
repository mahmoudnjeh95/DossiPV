import { describe, it, expect } from 'vitest';
import { formatDms, formatGpsPointDms } from '../src/gps';

describe('formatDms', () => {
  it('formats a positive latitude as N', () => {
    // 36.40400 deg = 36 deg 24' 14.4" N
    expect(formatDms(36.404, 'lat')).toBe('36°24\'14.4"N');
  });

  it('formats a positive longitude as E', () => {
    // 10.52719 deg ~= 10 deg 31' 37.9" E
    expect(formatDms(10.52719, 'lon')).toBe('10°31\'37.9"E');
  });

  it('formats a negative longitude as W', () => {
    expect(formatDms(-10.5, 'lon')).toBe('10°30\'0.0"W');
  });

  it('formats a negative latitude as S', () => {
    expect(formatDms(-36.0, 'lat')).toBe('36°0\'0.0"S');
  });
});

describe('formatGpsPointDms', () => {
  it('formats a full GPS point as "lat lon"', () => {
    const result = formatGpsPointDms({ lat: 36.404, lon: 10.52719 });
    expect(result).toBe('36°24\'14.4"N 10°31\'37.9"E');
  });

  it('produces the same string for the same point every time (single source of truth guarantee)', () => {
    const point = { lat: 36.404, lon: 10.52719 };
    const coverPageValue = formatGpsPointDms(point);
    const situationPlanValue = formatGpsPointDms(point);
    expect(coverPageValue).toBe(situationPlanValue);
  });
});
