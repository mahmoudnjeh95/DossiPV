import React from 'react';
import { IconProps, ICON_SIZES, ICON_COLORS } from './types';

export function Icon({
  size = 'md',
  color = 'inherit',
  className,
  ...props
}: IconProps): React.JSX.Element {
  const iconSize = ICON_SIZES[size];
  const iconColor = ICON_COLORS[color];

  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke={iconColor}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Children SVG paths provided by subclasses */}
    </svg>
  );
}
