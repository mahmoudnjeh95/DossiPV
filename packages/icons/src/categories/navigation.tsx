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

export const Home = wrapIcon('Home', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22v-7h6v7');
export const Dashboard = wrapIcon('Dashboard', [
  'M3 3h8v8H3z',
  'M13 3h8v8h-8z',
  'M3 13h8v8H3z',
  'M13 13h8v8h-8z',
]);
export const Projects = wrapIcon('Projects', 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9 M9 3v12 M9 3h6 M9 15h12');
export const Library = wrapIcon('Library', 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5 M8 7h8 M8 11h8 M8 15h4');
export const Settings = wrapIcon('Settings', 'M12 1v6 M12 17v6 M4.22 4.22l4.24 4.24 M15.54 15.54l4.24 4.24 M1 12h6 M17 12h6 M4.22 19.78l4.24-4.24 M15.54 8.46l4.24-4.24 M12 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6z');
export const Logout = wrapIcon('Logout', 'M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5 M17 9l4 3-4 3 M21 12H9');
export const Menu = wrapIcon('Menu', 'M3 12h18 M3 6h18 M3 18h18');
export const Close = wrapIcon('Close', 'M18 6L6 18 M6 6l12 12');
export const Search = wrapIcon('Search', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35');
