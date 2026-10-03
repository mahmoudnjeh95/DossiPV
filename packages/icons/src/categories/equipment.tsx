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
        fill="currentColor"
        fillOpacity="0.2"
        {...svgProps}
      >
        {paths.map((p, i) => (
          <path key={i} d={p} />
        ))}
      </svg>
    );
  };
}

export const PvModule = wrapIcon('PvModule', [
  'M3 3h18v18H3z',
  'M6 6h3v3H6z M12 6h3v3h-3z M18 6h1v3h-1z',
  'M6 12h3v3H6z M12 12h3v3h-3z M18 12h1v3h-1z',
  'M6 18h3v2H6z M12 18h3v2h-3z M18 18h1v2h-1z',
]);

export const Inverter = wrapIcon('Inverter', [
  'M2 8h20v8H2z',
  'M6 12h3 M15 12h3',
  'M8 6v4 M16 6v4',
]);

export const Spd = wrapIcon('Spd', [
  'M12 2v6 M12 16v6',
  'M6 8h12a2 2 0 0 1 0 4H6a2 2 0 0 0 0-4z',
  'M4 4l2.5 2.5 M18 4l-2.5 2.5 M4 20l2.5-2.5 M18 20l-2.5-2.5',
]);

export const DcSwitch = wrapIcon('DcSwitch', [
  'M4 12a4 4 0 0 1 8 0 4 4 0 0 0 8 0',
  'M3 8v8 M21 8v8',
]);

export const DcFuse = wrapIcon('DcFuse', [
  'M8 4h8v6a4 4 0 0 1-8 0V4z',
  'M3 10h3 M18 10h3',
]);

export const AcBreaker = wrapIcon('AcBreaker', [
  'M3 6h18v12H3z',
  'M9 10l3 3-3 3 M12 10l3 3-3 3',
  'M6 18h12',
]);

export const AcIsolator = wrapIcon('AcIsolator', [
  'M12 3v6 M12 15v6',
  'M6 9h12a3 3 0 0 1 0 6H6a3 3 0 0 0 0-6z',
]);

export const Cable = wrapIcon('Cable', [
  'M3 6l3 3 M6 6l3-3 M9 9l3 3 M12 12l3 3 M15 15l3 3 M18 15l3-3',
]);

export const Accessory = wrapIcon('Accessory', [
  'M12 2v20 M2 12h20',
  'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0z',
]);
