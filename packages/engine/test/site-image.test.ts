import { describe, it, expect } from 'vitest';
import { isInsideBounds, parseSiteImageBounds } from '../src/site-image';

const bounds = { north: 34.7956, south: 34.795, east: 10.7994, west: 10.7985 };

describe('parseSiteImageBounds', () => {
  it('reads stored bounds', () => {
    expect(parseSiteImageBounds(bounds)).toEqual(bounds);
  });

  it.each([
    ['null', null],
    ['a missing edge', { north: 34.7956, south: 34.795, east: 10.7994 }],
    ['a string edge', { ...bounds, west: '10.7985' }],
    ['north below south', { ...bounds, north: 34.794 }],
    ['east of nothing', { ...bounds, east: bounds.west }],
    ['a 10 km wide photo', { ...bounds, east: bounds.west + 0.1 }],
    ['a latitude off the map', { ...bounds, north: 89, south: 88.99 }],
  ])('is null for %s', (_label, value) => {
    expect(parseSiteImageBounds(value)).toBeNull();
  });
});

describe('isInsideBounds', () => {
  it('tells a point on the photo from one beside it', () => {
    expect(isInsideBounds(bounds, { lat: 34.7953, lon: 10.799 })).toBe(true);
    expect(isInsideBounds(bounds, { lat: 34.7953, lon: 10.8 })).toBe(false);
  });
});
