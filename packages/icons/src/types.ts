import type { SVGAttributes } from 'react';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconColor = 'inherit' | 'gold' | 'orange' | 'success' | 'error' | 'warning' | 'info';

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  size?: IconSize;
  color?: IconColor;
}

export const ICON_SIZES: Record<IconSize, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 48,
};

export const ICON_COLORS: Record<IconColor, string> = {
  inherit: 'currentColor',
  gold: '#FFA500',
  orange: '#FF8C00',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};
