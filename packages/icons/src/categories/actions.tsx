import React from 'react';
import { IconProps } from '../types';

function wrapIcon(name: string, path: string | string[]) {
  return function IconComponent(props: IconProps) {
    const paths = Array.isArray(path) ? path : [path];
    return (
      <svg viewBox="0 0 24 24" {...props}>
        {paths.map((p, i) => (
          <path key={i} d={p} stroke="currentColor" strokeWidth="1.5" fill="none" />
        ))}
      </svg>
    );
  };
}

export const Edit = wrapIcon('Edit', [
  'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
  'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
]);

export const Delete = wrapIcon('Delete', [
  'M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7',
  'M10 11v6 M14 11v6 M3 7h18 M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
]);

export const Add = wrapIcon('Add', [
  'M12 5v14 M5 12h14',
]);

export const Check = wrapIcon('Check', [
  'M20 6L9 17l-5-5',
]);

export const Error = wrapIcon('Error', [
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
  'M13 13h-2v-2h2z M13 17h-2v-2h2z',
]);

export const Warning = wrapIcon('Warning', [
  'M12 2L2 20h20z M12 9v4 M12 17h.01',
]);

export const Info = wrapIcon('Info', [
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
  'M13 16h-2v-6h2z M13 8h-2V6h2z',
]);

export const Loading = wrapIcon('Loading', [
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z M12 4a8 8 0 0 1 0 16 8 8 0 0 1 0-16z',
  'M12 4c4.42 0 8 3.58 8 8',
]);

export const Eye = wrapIcon('Eye', [
  'M12 5C7 5 2.73 8.11 1 12.46c1.73 4.35 6 7.54 11 7.54s9.27-3.19 11-7.54C21.27 8.11 17 5 12 5z',
  'M12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z',
]);

export const EyeOff = wrapIcon('EyeOff', [
  'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7z',
  'M2 4.27l2.28 2.28A11.804 11.804 0 001 11.5c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l3.35 3.35 1.41-1.41L3.41 3 2 4.27z',
]);
