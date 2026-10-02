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

  it('carries seconds rounding up to 60 into minutes (36.4 deg = 36°24\'0.0", not 36°23\'60.0")', () => {
    // 36.4 deg => 36 deg, 0.4*60=24.0 min exactly => minutesFull=24.0, minutes=floor(24.0)=24,
    // seconds=(24.0-24)*60=0. With floating point, minutesFull can land fractionally below 24
    // (e.g. 23.999999999999996), making minutes=23 and seconds~59.99999999999976, which
    // seconds.toFixed(1) rounds up to "60.0" without carrying into minutes/degrees — the bug.
    // The fix must detect that carry and produce 36°24'0.0"N.
    expect(formatDms(36.4, 'lat')).toBe('36°24\'0.0"N');
  });

  it('carries a rollover all the way into degrees when minutes AND seconds both round up', () => {
    // 35.999999999999993 deg is a hair below 36 deg. Its minutesFull and seconds both sit at
    // the top of their range due to floating point, such that rounding seconds to 1 decimal
    // place carries into minutes, and that carry then carries into degrees: 36°0'0.0"N.
    expect(formatDms(35.999999999999993, 'lat')).toBe('36°0\'0.0"N');
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
