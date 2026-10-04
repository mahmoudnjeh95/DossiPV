import React from 'react';
import { IconProps, ICON_SIZES, ICON_COLORS } from '../types';

function wrapIcon(
  name: string,
  path: string | string[],
): React.ComponentType<IconProps> {
  return function IconComponent({ size, color, ...svgProps }: IconProps): React.JSX.Element {
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

export const ChartBar = wrapIcon('ChartBar', [
  'M3 20V3 M3 20h18',
  'M7 20v-8 M12 20v-4 M17 20v-12',
]);

export const ChartLine = wrapIcon('ChartLine', [
  'M3 20V3 M3 20h18',
  'M7 14l3-3 4 4 5-5',
]);

export const Statistics = wrapIcon('Statistics', [
  'M3 20h18 M3 3v17',
  'M6 16h2v4H6z M11 12h2v8h-2z M16 8h2v12h-2z',
]);

export const TrendUp = wrapIcon('TrendUp', [
  'M23 6l-9.5 9.5-5-5L1 18',
  'M17 6h6v6',
]);

export const KwHours = wrapIcon('KwHours', [
  'M12 2v20 M2 12h20',
  'M9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0z',
]);

export const Co2Saved = wrapIcon('Co2Saved', [
  'M12 2L2 7v10a10 10 0 0 0 10 10 10 10 0 0 0 10-10V7l-10-5z',
  'M8 12h8',
]);

export const Revenue = wrapIcon('Revenue', [
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
  'M12 6v12 M9 9h6a3 3 0 0 0 0 6H9z',
]);
