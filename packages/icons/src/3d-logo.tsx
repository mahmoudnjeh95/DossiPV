import React from 'react';

interface SolarixProLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: 64,
  md: 120,
  lg: 200,
  xl: 240,
};

export function SolarixProLogo({ size = 'md', className }: SolarixProLogoProps): React.JSX.Element {
  const px = SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="solarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#FF8C00" />
        </linearGradient>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="4" dy="6" stdDeviation="4" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Base Solar Panel (tilted isometric) */}
      <polygon
        points="80,140 160,140 180,100 100,100"
        fill="url(#solarGrad)"
        filter="url(#shadow)"
        opacity="0.9"
      />

      {/* Panel Edge Shadow */}
      <polygon
        points="160,140 180,100 180,110 160,150"
        fill="#1A2332"
        opacity="0.15"
      />

      {/* Sun Rays - Outer Ring */}
      <circle cx="120" cy="80" r="50" fill="none" stroke="url(#solarGrad)" strokeWidth="3" />

      {/* Sun Rays - 8 Radiating Lines */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 120 + 40 * Math.cos(rad);
        const y1 = 80 + 40 * Math.sin(rad);
        const x2 = 120 + 65 * Math.cos(rad);
        const y2 = 80 + 65 * Math.sin(rad);
        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="url(#solarGrad)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        );
      })}

      {/* Sun Center Circle */}
      <circle cx="120" cy="80" r="20" fill="url(#solarGrad)" filter="url(#shadow)" />

      {/* Text: SOLARIX PRO */}
      <text
        x="120"
        y="200"
        textAnchor="middle"
        fontSize="20"
        fontWeight="bold"
        fill="#1A2332"
        fontFamily="Arial, sans-serif"
      >
        SOLARIX PRO
      </text>
    </svg>
  );
}
