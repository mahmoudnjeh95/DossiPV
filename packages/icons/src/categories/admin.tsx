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

export const Users = wrapIcon('Users', [
  'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
  'M16 3a4 4 0 0 1 0 8 4 4 0 0 1 0-8z M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
]);

export const Company = wrapIcon('Company', [
  'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  'M8 9h8 M8 13h8 M8 17h4',
]);

export const Subscription = wrapIcon('Subscription', [
  'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2',
  'M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
  'M9 14l2 2 4-4',
]);

export const Payment = wrapIcon('Payment', [
  'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  'M4 9h16 M6 15h.01',
]);

export const Lock = wrapIcon('Lock', [
  'M19 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2z',
  'M7 11V7a5 5 0 0 1 10 0v4 M12 14v2',
]);

export const Unlock = wrapIcon('Unlock', [
  'M5 13a3.5 3.5 0 0 1 7 0v6a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-6z',
  'M19 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-5',
  'M7 11V7a5 5 0 0 1 10 0',
]);

export const Shield = wrapIcon('Shield', [
  'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'M12 15l3-2-3-2-3 2 3 2z',
]);

export const Database = wrapIcon('Database', [
  'M12 3c-4.41 0-8 1.79-8 4v2c0 2.21 3.59 4 8 4s8-1.79 8-4V7c0-2.21-3.59-4-8-4z',
  'M4 7v6c0 2.21 3.59 4 8 4s8-1.79 8-4v-6',
  'M4 13v6c0 2.21 3.59 4 8 4s8-1.79 8-4v-6',
]);
