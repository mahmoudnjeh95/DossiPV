import React from 'react';
import { IconProps, ICON_SIZES, ICON_COLORS } from '../types';

function wrapIcon(name: string, path: string | string[]) {
  return function IconComponent({ size, color, ...svgProps }: IconProps) {
    const px = ICON_SIZES[size ?? 'md'];
    const stroke = ICON_COLORS[color ?? 'inherit'];
    const paths = Array.isArray(path) ? path : [path];
    return (
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        stroke={stroke}
        strokeWidth="1.5"
        fill="none"
        {...svgProps}
      >
        {paths.map((p, i) => (
          <path key={i} d={p} />
        ))}
      </svg>
    );
  };
}

export const Map = wrapIcon('Map', [
  'M12 2l6.18 2.73a2 2 0 0 1 1.2 1.81v6.92a2 2 0 0 1-1.2 1.81L12 20l-6.18-2.73A2 2 0 0 1 4.62 15.46V8.54a2 2 0 0 1 1.2-1.81L12 2z',
  'M12 2v16',
]);

export const LocationPin = wrapIcon('LocationPin', [
  'M12 2C7.58 2 4 5.58 4 10c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z M12 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z',
]);

export const Polygon = wrapIcon('Polygon', [
  'M12 2L2 8v8l10 6 10-6V8L12 2z',
]);

export const MarkerTech = wrapIcon('MarkerTech', [
  'M12 2C7.58 2 4 5.58 4 10c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z',
  'M12 9c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z',
]);

export const MarkerMeter = wrapIcon('MarkerMeter', [
  'M12 2C7.58 2 4 5.58 4 10c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z',
  'M12 8v4h3',
]);

export const MarkerEarth = wrapIcon('MarkerEarth', [
  'M12 2C7.58 2 4 5.58 4 10c0 5.25 8 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z',
  'M12 8c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z',
]);

export const Compass = wrapIcon('Compass', [
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
  'M12 7v10 M12 12h5',
]);
