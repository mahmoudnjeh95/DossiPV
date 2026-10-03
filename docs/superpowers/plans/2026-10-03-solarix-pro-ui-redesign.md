# SOLARIX PRO UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive custom SVG icon system, a branded landing page with 3D logo, and redesign all dashboards/views with consistent iconography and solar-themed color palette.

**Architecture:** 
- New `packages/icons/` package exports 40+ custom SVG React components grouped by category (navigation, equipment, actions, data, map, admin)
- Landing page (`/`) with dismissible hero, 3D logo, and feature cards
- Global color palette as CSS variables (Solar Gold, Orange, Navy) applied across all authenticated views
- Reusable `<MetricCard>` and `<StatCard>` components for dashboard redesign
- Navigation and sidebar updated with icon integration
- Equipment CRUD, map editor, simulation, and admin pages all receive icon updates

**Tech Stack:**
- React 19 + Next.js 16 (existing)
- Inline SVG (no icon library dependency)
- Tailwind CSS or CSS modules (existing patterns followed)
- TypeScript for icon prop typing

**Spec:** `docs/superpowers/specs/2026-10-03-solarix-pro-ui-redesign.md`

---

## Global Constraints

- All icons must be custom SVG React components (no external icon library)
- Color palette: Solar Gold (#FFA500), Orange (#FF8C00), Navy (#1A2332), Light Gray (#F5F5F5)
- Responsive sizing: 16px–48px without clarity loss
- 3D logo: SVG with gradient (optional Three.js enhancement deferred)
- Landing page must be dismissible/clickable to navigate away
- All existing functionality must remain intact (no breaking changes)
- Tests must pass: 419/419 workspace tests (current baseline)

---

## Review Focus

1. **Icon color inheritance**: Icons must respect `currentColor` by default so they inherit parent text color without explicit class bindings in every usage
2. **Responsive icon sizing**: Icons at 16px (mobile nav), 24px (lists), 32px (dashboard cards), 48px (hero) must remain readable — test across viewport sizes
3. **Dismissible landing page UX**: Hero section click/tap must smoothly navigate away without jarring redirect — test on mobile and desktop
4. **Dashboard card alignment**: Metric card icons, text, and counts must align visually across different content lengths — test with 1-digit, 2-digit, and 4-digit values
5. **Icon category completeness**: Every action/navigation element across all 9 equipment CRUD pages, admin panel, map, and simulation must have a corresponding icon — no fallback text-only UI

---

## File Structure

**New Files (Icons Package):**
- `packages/icons/package.json` — new package config
- `packages/icons/src/index.ts` — main exports barrel
- `packages/icons/src/types.ts` — TypeScript interfaces (IconProps, SizeType, ColorType)
- `packages/icons/src/Icon.tsx` — base wrapper component
- `packages/icons/src/3d-logo.tsx` — SOLARIX PRO 3D logo component
- `packages/icons/src/categories/navigation.tsx` — navigation icons (Home, Dashboard, Projects, etc.)
- `packages/icons/src/categories/equipment.tsx` — equipment type icons (PvModule, Inverter, etc.)
- `packages/icons/src/categories/actions.tsx` — action icons (Edit, Delete, Add, Check, etc.)
- `packages/icons/src/categories/data.tsx` — data/analytics icons (ChartBar, ChartLine, TrendUp, etc.)
- `packages/icons/src/categories/map.tsx` — map icons (Map, LocationPin, Polygon, Marker, Compass)
- `packages/icons/src/categories/admin.tsx` — admin icons (Users, Company, Subscription, Payment, Lock, etc.)
- `packages/icons/tests/Icon.test.tsx` — unit tests for icon component
- `packages/icons/vitest.config.ts` — test config

**New Files (Web App):**
- `apps/web/app/page.tsx` — landing page (replaces existing minimal placeholder)
- `apps/web/components/landing/hero.tsx` — hero section with 3D logo
- `apps/web/components/landing/features.tsx` — 3-column features section
- `apps/web/components/landing/footer.tsx` — call-to-action footer
- `apps/web/components/nav/top-nav.tsx` — top navigation with logo + icons
- `apps/web/components/nav/sidebar.tsx` — sidebar navigation with icons
- `apps/web/components/cards/metric-card.tsx` — reusable stats card component
- `apps/web/app/(app)/dashboard/stats-card.tsx` — installer dashboard metric card variant
- `apps/web/app/admin/(protected)/components/admin-stats-card.tsx` — admin dashboard metric card variant
- `apps/web/styles/palette.css` — global color palette CSS variables
- `apps/web/styles/icons.css` — icon sizing and color utility classes

**Modified Files:**
- `apps/web/app/layout.tsx` — import global palette CSS
- `apps/web/app/(app)/layout.tsx` — integrate top-nav + sidebar
- `apps/web/app/(app)/dashboard/page.tsx` — redesign with icon cards
- `apps/web/app/admin/(protected)/layout.tsx` — integrate top-nav + admin sidebar
- `apps/web/app/admin/(protected)/page.tsx` — redesign with admin metric cards
- `apps/web/app/admin/(protected)/installers/page.tsx` — add icons to installer list
- `apps/web/app/(app)/projects/page.tsx` — add project icons
- `apps/web/app/(app)/projects/[id]/page.tsx` — add icons to project detail
- `apps/web/app/(app)/projects/[id]/map/page.tsx` — add map icons
- `apps/web/app/(app)/projects/[id]/sections/forms/*.tsx` — add section icons (8 form files)
- `apps/web/app/admin/(protected)/equipment/*/page.tsx` — add type-specific equipment icons (9 equipment types × 3 pages = 27 files, but grouped in tasks)
- `packages/package.json` (root) — add `packages/icons` to workspaces

---

## Task Sequence

### Task 1: Create Icon System Package & Base Components

**Files:**
- Create: `packages/icons/package.json`
- Create: `packages/icons/tsconfig.json`
- Create: `packages/icons/vitest.config.ts`
- Create: `packages/icons/src/types.ts`
- Create: `packages/icons/src/Icon.tsx`
- Create: `packages/icons/src/index.ts`
- Modify: `packages/package.json` (add icons to workspaces)

**Interfaces:**
- Produces: 
  - `Icon` component exported from `packages/icons/src/Icon.tsx`
  - `IconProps` interface: `{ size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; color?: 'inherit' | 'gold' | 'orange' | 'success' | 'error' | 'warning' | 'info'; className?: string; }`
  - Size mappings: `xs=16, sm=20, md=24, lg=32, xl=48` (px)

---

- [ ] **Step 1: Create `packages/icons/package.json`**

```json
{
  "name": "@dossipv/icons",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/icons/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [{ "path": "../db" }]
}
```

- [ ] **Step 3: Create `packages/icons/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
```

- [ ] **Step 4: Create `packages/icons/src/types.ts`**

```ts
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconColor = 'inherit' | 'gold' | 'orange' | 'success' | 'error' | 'warning' | 'info';

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
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
```

- [ ] **Step 5: Create `packages/icons/src/Icon.tsx`**

```tsx
import React from 'react';
import { IconProps, ICON_SIZES, ICON_COLORS } from './types';

export function Icon({
  size = 'md',
  color = 'inherit',
  className,
  ...props
}: IconProps) {
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
```

- [ ] **Step 6: Create `packages/icons/src/index.ts`**

```ts
export * from './types';
export { Icon } from './Icon';

// Navigation icons
export { Home, Dashboard, Projects, Library, Settings, Logout, Menu, Close, Search } from './categories/navigation';

// Equipment icons
export { PvModule, Inverter, Spd, DcSwitch, DcFuse, AcBreaker, AcIsolator, Cable, Accessory } from './categories/equipment';

// Action icons
export { Edit, Delete, Add, Check, Error, Warning, Info, Loading, Eye, EyeOff } from './categories/actions';

// Data icons
export { ChartBar, ChartLine, Statistics, TrendUp, KwHours, Co2Saved, Revenue } from './categories/data';

// Map icons
export { Map, LocationPin, Polygon, MarkerTech, MarkerMeter, MarkerEarth, Compass } from './categories/map';

// Admin icons
export { Users, Company, Subscription, Payment, Lock, Unlock, Shield, Database } from './categories/admin';

// 3D Logo
export { SolarixProLogo } from './3d-logo';
```

- [ ] **Step 7: Update root `packages/package.json`**

Add `"packages/icons"` to the `"workspaces"` array (if using Yarn/npm workspaces).

```json
{
  "workspaces": [
    "packages/icons",
    "packages/auth",
    "packages/db",
    "packages/file-storage",
    "packages/document-text",
    "packages/dossier-worker",
    "packages/docx-template",
    "packages/pvgis-client",
    "apps/web"
  ]
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/icons/ packages/package.json
git commit -m "feat(icons): create icon system package with base types and Icon component"
```

---

### Task 2: Build Navigation Icon Components

**Files:**
- Create: `packages/icons/src/categories/navigation.tsx`

**Interfaces:**
- Produces: Navigation icon exports: `Home`, `Dashboard`, `Projects`, `Library`, `Settings`, `Logout`, `Menu`, `Close`, `Search`
- Each icon: `(props: IconProps) => JSX.Element`

---

- [ ] **Step 1: Create `packages/icons/src/categories/navigation.tsx`**

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/icons/src/categories/navigation.tsx
git commit -m "feat(icons): add navigation icon components"
```

---

### Task 3: Build Equipment Icon Components

**Files:**
- Create: `packages/icons/src/categories/equipment.tsx`

**Interfaces:**
- Produces: Equipment icon exports: `PvModule`, `Inverter`, `Spd`, `DcSwitch`, `DcFuse`, `AcBreaker`, `AcIsolator`, `Cable`, `Accessory`

---

- [ ] **Step 1: Create `packages/icons/src/categories/equipment.tsx`**

```tsx
import React from 'react';
import { IconProps } from '../types';

function wrapIcon(name: string, path: string | string[]) {
  return function IconComponent(props: IconProps) {
    const paths = Array.isArray(path) ? path : [path];
    return (
      <svg viewBox="0 0 24 24" {...props}>
        {paths.map((p, i) => (
          <path key={i} d={p} stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" />
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/icons/src/categories/equipment.tsx
git commit -m "feat(icons): add equipment type icon components"
```

---

### Task 4: Build Action, Data, Map, and Admin Icon Categories

**Files:**
- Create: `packages/icons/src/categories/actions.tsx`
- Create: `packages/icons/src/categories/data.tsx`
- Create: `packages/icons/src/categories/map.tsx`
- Create: `packages/icons/src/categories/admin.tsx`

**Interfaces:**
- Produces: 
  - Actions: `Edit`, `Delete`, `Add`, `Check`, `Error`, `Warning`, `Info`, `Loading`, `Eye`, `EyeOff`
  - Data: `ChartBar`, `ChartLine`, `Statistics`, `TrendUp`, `KwHours`, `Co2Saved`, `Revenue`
  - Map: `Map`, `LocationPin`, `Polygon`, `MarkerTech`, `MarkerMeter`, `MarkerEarth`, `Compass`
  - Admin: `Users`, `Company`, `Subscription`, `Payment`, `Lock`, `Unlock`, `Shield`, `Database`

---

- [ ] **Step 1: Create `packages/icons/src/categories/actions.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `packages/icons/src/categories/data.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `packages/icons/src/categories/map.tsx`**

```tsx
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
```

- [ ] **Step 4: Create `packages/icons/src/categories/admin.tsx`**

```tsx
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
```

- [ ] **Step 5: Commit**

```bash
git add packages/icons/src/categories/
git commit -m "feat(icons): add action, data, map, and admin icon categories"
```

---

### Task 5: Create 3D Logo Component

**Files:**
- Create: `packages/icons/src/3d-logo.tsx`

**Interfaces:**
- Produces: `SolarixProLogo` component with `size?: 'sm' | 'md' | 'lg' | 'xl'` prop

---

- [ ] **Step 1: Create `packages/icons/src/3d-logo.tsx`**

```tsx
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

export function SolarixProLogo({ size = 'md', className }: SolarixProLogoProps) {
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/icons/src/3d-logo.tsx
git commit -m "feat(icons): add SOLARIX PRO 3D logo component"
```

---

### Task 6: Create Global Color Palette & Icon Styling

**Files:**
- Create: `apps/web/styles/palette.css`
- Create: `apps/web/styles/icons.css`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: CSS variables for colors, icon sizing utilities, usable in all components

---

- [ ] **Step 1: Create `apps/web/styles/palette.css`**

```css
:root {
  /* Primary Solar/Energy Colors */
  --color-gold: #FFA500;
  --color-gold-dark: #FF8C00;
  --color-gold-light: #FFD700;

  /* Neutral Colors */
  --color-navy: #1A2332;
  --color-gray-light: #F5F5F5;
  --color-gray-neutral: #333333;
  --color-gray-border: #CCCCCC;

  /* Semantic Colors */
  --color-success: #10B981;
  --color-error: #EF4444;
  --color-warning: #F59E0B;
  --color-info: #3B82F6;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary: var(--color-navy);
    --color-bg-secondary: #232e3f;
    --color-text-primary: #f5f5f5;
    --color-text-secondary: #cccccc;
  }
}

@media (prefers-color-scheme: light) {
  :root {
    --color-bg-primary: white;
    --color-bg-secondary: var(--color-gray-light);
    --color-text-primary: var(--color-gray-neutral);
    --color-text-secondary: #666666;
  }
}

* {
  box-sizing: border-box;
}

html, body {
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  background-color: var(--color-bg-primary);
}
```

- [ ] **Step 2: Create `apps/web/styles/icons.css`**

```css
/* Icon Sizing Utilities */
.icon-xs {
  width: 16px;
  height: 16px;
}

.icon-sm {
  width: 20px;
  height: 20px;
}

.icon-md {
  width: 24px;
  height: 24px;
}

.icon-lg {
  width: 32px;
  height: 32px;
}

.icon-xl {
  width: 48px;
  height: 48px;
}

/* Icon Color Utilities */
.icon-gold {
  color: var(--color-gold);
}

.icon-orange {
  color: var(--color-gold-dark);
}

.icon-success {
  color: var(--color-success);
}

.icon-error {
  color: var(--color-error);
}

.icon-warning {
  color: var(--color-warning);
}

.icon-info {
  color: var(--color-info);
}

.icon-navy {
  color: var(--color-navy);
}

/* Icon in Buttons */
button .icon,
a .icon {
  margin-right: 0.5rem;
  vertical-align: middle;
}

/* Navigation Icon States */
.nav-item .icon {
  color: var(--color-navy);
  transition: color 200ms ease-in-out;
}

.nav-item:hover .icon,
.nav-item.active .icon {
  color: var(--color-gold);
}

/* Card Icon Styling */
.card .icon {
  color: var(--color-gold);
  margin-bottom: 0.5rem;
}

/* Stat Card Icon */
.stat-card .icon {
  font-size: 2rem;
  color: var(--color-gold);
}
```

- [ ] **Step 3: Update `apps/web/app/layout.tsx`**

Add imports at the top:

```tsx
import '@/styles/palette.css';
import '@/styles/icons.css';
```

(Ensure these are imported before other global styles.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/styles/palette.css apps/web/styles/icons.css apps/web/app/layout.tsx
git commit -m "feat(web): add global color palette and icon styling"
```

---

### Task 7: Build Landing Page Components

**Files:**
- Create: `apps/web/components/landing/hero.tsx`
- Create: `apps/web/components/landing/features.tsx`
- Create: `apps/web/components/landing/footer.tsx`

**Interfaces:**
- Produces: Three reusable landing page section components
- Hero: Displays SolarixProLogo, headline, and CTA buttons
- Features: 3-column card grid with icon + text
- Footer: Call-to-action and links

---

- [ ] **Step 1: Create `apps/web/components/landing/hero.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { SolarixProLogo } from '@dossipv/icons';

export function LandingHero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-gray-50 px-4">
      {/* Logo */}
      <div className="mb-8">
        <SolarixProLogo size="lg" />
      </div>

      {/* Headline */}
      <h1 className="text-4xl md:text-5xl font-bold text-navy text-center max-w-2xl mb-4">
        Professional PV Dossier Generation
      </h1>

      {/* Subheadline */}
      <p className="text-lg md:text-xl text-gray-600 text-center max-w-2xl mb-12">
        Streamline your STEG technical documentation with precision and speed.
      </p>

      {/* CTA Buttons */}
      <div className="flex gap-4 flex-wrap justify-center mb-16">
        <Link
          href="/login"
          className="px-8 py-3 bg-white border-2 border-gold text-gold font-semibold rounded-lg hover:bg-gold hover:text-white transition-colors"
        >
          Login
        </Link>
        <Link
          href="/login?mode=signup"
          className="px-8 py-3 bg-gold text-white font-semibold rounded-lg hover:bg-orange transition-colors shadow-md"
        >
          Get Started
        </Link>
      </div>

      {/* Dismiss Text */}
      <p className="text-sm text-gray-500 text-center">
        Click anywhere to continue →
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/landing/features.tsx`**

```tsx
import { Zap, CheckCircle, Shield } from '@dossipv/icons';

interface FeatureCardProps {
  icon: React.ComponentType<any>;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-white rounded-lg p-8 text-center shadow-sm hover:shadow-md transition-shadow">
      <div className="mb-4 flex justify-center">
        <Icon size="lg" className="icon-gold" />
      </div>
      <h3 className="text-xl font-bold text-navy mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

export function LandingFeatures() {
  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-navy mb-12">Why SOLARIX PRO?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard
            icon={Zap}
            title="Lightning Fast"
            description="Generate complete dossiers in minutes, not hours."
          />
          <FeatureCard
            icon={CheckCircle}
            title="Precision & Accuracy"
            description="Compliance with NF C 15-100 and STEG requirements guaranteed."
          />
          <FeatureCard
            icon={Shield}
            title="Enterprise Grade"
            description="Built for professional installers with security and reliability."
          />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/landing/footer.tsx`**

```tsx
import Link from 'next/link';

export function LandingFooter() {
  return (
    <section className="py-12 px-4 bg-gray-50 border-t border-gray-200">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-2xl font-bold text-navy mb-4">
          Ready to simplify your workflow?
        </h2>
        <p className="text-gray-600 mb-6">
          Join professional PV installers managing their technical documentation with SOLARIX PRO.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/login"
            className="px-6 py-2 text-gold font-semibold hover:text-orange transition-colors"
          >
            Login
          </Link>
          <Link
            href="/login?mode=signup"
            className="px-6 py-2 bg-gold text-white font-semibold rounded-lg hover:bg-orange transition-colors"
          >
            Create Account
          </Link>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-200 text-sm text-gray-600">
          <p>&copy; 2026 SOLARIX PRO. All rights reserved.</p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/landing/
git commit -m "feat(web): add landing page components (hero, features, footer)"
```

---

### Task 8: Create Landing Page Root Route

**Files:**
- Create: `apps/web/app/page.tsx` (replaces existing minimal placeholder)

**Interfaces:**
- Consumes: LandingHero, LandingFeatures, LandingFooter components
- Produces: Full landing page with dismissible hero overlay

---

- [ ] **Step 1: Create `apps/web/app/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { LandingHero } from '@/components/landing/hero';
import { LandingFeatures } from '@/components/landing/features';
import { LandingFooter } from '@/components/landing/footer';

export default function HomePage() {
  const [heroVisible, setHeroVisible] = useState(true);

  const handleHeroDismiss = () => {
    setHeroVisible(false);
  };

  return (
    <main>
      {heroVisible && (
        <div
          className="cursor-pointer"
          onClick={handleHeroDismiss}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleHeroDismiss();
            }
          }}
        >
          <LandingHero />
        </div>
      )}
      <LandingFeatures />
      <LandingFooter />
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): implement landing page with dismissible hero"
```

---

### Task 9: Create Dashboard Card Components

**Files:**
- Create: `apps/web/components/cards/metric-card.tsx`
- Create: `apps/web/app/(app)/dashboard/stats-card.tsx`
- Create: `apps/web/app/admin/(protected)/components/admin-stats-card.tsx`

**Interfaces:**
- MetricCard: Generic reusable card with icon, label, value
- StatsCard: Installer-specific variant with styled value display
- AdminStatsCard: Admin-specific variant for aggregates

---

- [ ] **Step 1: Create `apps/web/components/cards/metric-card.tsx`**

```tsx
import React from 'react';

interface MetricCardProps {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
  description?: string;
  className?: string;
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  description,
  className = '',
}: MetricCardProps) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100 ${className}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
          <p className="text-2xl md:text-3xl font-bold text-navy">{value}</p>
          {description && <p className="text-xs text-gray-500 mt-2">{description}</p>}
        </div>
        <div className="flex-shrink-0">
          <Icon size="lg" className="icon-gold" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(app)/dashboard/stats-card.tsx`**

```tsx
'use client';

import { MetricCard } from '@/components/cards/metric-card';
import React from 'react';

interface InstallerStatsCardProps {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
}

export function StatsCard({ icon, label, value }: InstallerStatsCardProps) {
  return <MetricCard icon={icon} label={label} value={value} />;
}
```

- [ ] **Step 3: Create `apps/web/app/admin/(protected)/components/admin-stats-card.tsx`**

```tsx
'use client';

import { MetricCard } from '@/components/cards/metric-card';
import React from 'react';

interface AdminStatsCardProps {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
}

export function AdminStatsCard({ icon, label, value }: AdminStatsCardProps) {
  return <MetricCard icon={icon} label={label} value={value} />;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/cards/ apps/web/app/(app)/dashboard/stats-card.tsx apps/web/app/admin/(protected)/components/admin-stats-card.tsx
git commit -m "feat(web): create reusable metric card components for dashboards"
```

---

### Task 10: Redesign Installer Dashboard with Icons

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: StatsCard component, Dashboard icons (Projects, Dossier, Users)
- Produces: Icon-rich dashboard with 4 metric cards, styled with color palette

---

- [ ] **Step 1: Read current dashboard**

```bash
# Check current implementation
cat "apps/web/app/(app)/dashboard/page.tsx"
```

Expected: Minimal dashboard with basic structure

- [ ] **Step 2: Update `apps/web/app/(app)/dashboard/page.tsx`**

```tsx
import { Suspense } from 'react';
import {
  Dashboard,
  Projects,
  FileText,
  Users,
  TrendUp,
} from '@dossipv/icons';
import { StatsCard } from './stats-card';
import Link from 'next/link';

async function getDashboardStats() {
  // TODO: Fetch real stats from DB
  return {
    activeProjects: 12,
    dossierCount: 45,
    monthlyCapacity: 125.8,
    teamMembers: 3,
  };
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-40 bg-gray-200 rounded-xl"></div>
    </div>
  );
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
            <Dashboard size="lg" className="icon-gold" />
            Dashboard
          </h1>
          <p className="text-gray-600 mt-1">Welcome back! Here's your overview.</p>
        </div>

        {/* Stats Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            icon={Projects}
            label="Active Projects"
            value={stats.activeProjects}
          />
          <StatsCard
            icon={FileText}
            label="Dossiers Generated"
            value={stats.dossierCount}
          />
          <StatsCard
            icon={TrendUp}
            label="Monthly Capacity (kWp)"
            value={stats.monthlyCapacity}
          />
          <StatsCard
            icon={Users}
            label="Team Members"
            value={stats.teamMembers}
          />
        </div>

        {/* Quick Actions */}
        <section className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-navy mb-4">Quick Actions</h2>
          <div className="flex gap-4 flex-wrap">
            <Link
              href="/projects/new"
              className="flex items-center gap-2 px-4 py-2 bg-gold text-white font-semibold rounded-lg hover:bg-orange transition-colors"
            >
              <Projects size="sm" />
              New Project
            </Link>
            <Link
              href="/library"
              className="flex items-center gap-2 px-4 py-2 border-2 border-gold text-gold font-semibold rounded-lg hover:bg-gold hover:text-white transition-colors"
            >
              <Library size="sm" />
              Library
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/dashboard/page.tsx"
git commit -m "feat(web): redesign installer dashboard with icon cards"
```

---

### Task 11: Redesign Admin Dashboard with Icons

**Files:**
- Modify: `apps/web/app/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: AdminStatsCard component, Admin icons (Users, FileText, TrendUp, Payment)
- Produces: Icon-rich admin dashboard with 4 metric cards

---

- [ ] **Step 1: Update `apps/web/app/admin/(protected)/page.tsx`**

```tsx
import { Suspense } from 'react';
import { Users, FileText, TrendUp, Payment } from '@dossipv/icons';
import { AdminStatsCard } from './components/admin-stats-card';

async function getAdminStats() {
  // TODO: Fetch real aggregates from DB
  return {
    activeInstallers: 28,
    dossiersThisMonth: 142,
    claudeCostThisMonth: 284.56,
    totalRevenue: 12450.0,
  };
}

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">System overview and key metrics.</p>
        </div>

        {/* Stats Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <AdminStatsCard
            icon={Users}
            label="Active Installers"
            value={stats.activeInstallers}
          />
          <AdminStatsCard
            icon={FileText}
            label="Dossiers (This Month)"
            value={stats.dossiersThisMonth}
          />
          <AdminStatsCard
            icon={TrendUp}
            label="Claude Cost (This Month)"
            value={`$${stats.claudeCostThisMonth.toFixed(2)}`}
          />
          <AdminStatsCard
            icon={Payment}
            label="Total Revenue"
            value={`$${stats.totalRevenue.toFixed(2)}`}
          />
        </div>

        {/* Installers Section */}
        <section className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-navy mb-4">Installer Management</h2>
          <p className="text-gray-600 mb-4">View and manage all company subscriptions.</p>
          <a
            href="/admin/installers"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gold text-white font-semibold rounded-lg hover:bg-orange transition-colors"
          >
            <Users size="sm" />
            View Installers
          </a>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/app/admin/(protected)/page.tsx"
git commit -m "feat(web): redesign admin dashboard with icon cards"
```

---

### Task 12: Add Icons to Navigation & Sidebar

**Files:**
- Create: `apps/web/components/nav/top-nav.tsx`
- Create: `apps/web/components/nav/sidebar.tsx`
- Modify: `apps/web/app/(app)/layout.tsx` (integrate top-nav + sidebar)
- Modify: `apps/web/app/admin/(protected)/layout.tsx` (integrate top-nav + admin sidebar)

**Interfaces:**
- TopNav: Displays SOLARIX PRO logo, breadcrumbs, user profile icon
- Sidebar: Navigation menu with category icons

---

- [ ] **Step 1: Create `apps/web/components/nav/top-nav.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { SolarixProLogo, Settings, LogOut } from '@dossipv/icons';
import { logoutAction } from '@/app/login/actions';

interface TopNavProps {
  title?: string;
  showUser?: boolean;
  userName?: string;
}

export function TopNav({ title, showUser = true, userName = 'User' }: TopNavProps) {
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="px-4 md:px-8 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <SolarixProLogo size="sm" />
          <span className="font-bold text-navy hidden sm:inline">SOLARIX PRO</span>
        </Link>

        {/* Title (center, optional) */}
        {title && <h1 className="text-lg font-semibold text-navy">{title}</h1>}

        {/* Right Side - User Menu */}
        {showUser && (
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings size="md" className="text-navy" />
            </Link>
            <div className="h-8 w-8 bg-gold rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-navy"
                title="Logout"
              >
                <LogOut size="md" />
              </button>
            </form>
          </div>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/nav/sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Dashboard,
  Projects,
  Library,
  Settings,
  Users,
  Database,
} from '@dossipv/icons';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<any>;
  badge?: number;
}

interface SidebarProps {
  items: NavItem[];
  isAdmin?: boolean;
}

export function Sidebar({ items, isAdmin = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="bg-white border-r border-gray-200 w-64 hidden md:block sticky top-20 h-[calc(100vh-80px)]">
      <nav className="p-4 space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg font-medium transition-colors nav-item ${
                isActive
                  ? 'bg-gold bg-opacity-10 text-gold'
                  : 'text-navy hover:bg-gray-50'
              }`}
            >
              <Icon size="md" />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="bg-gold text-white text-xs px-2 py-1 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function InstallerSidebarItems(): NavItem[] {
  return [
    { label: 'Dashboard', href: '/dashboard', icon: Dashboard },
    { label: 'Projects', href: '/projects', icon: Projects },
    { label: 'Library', href: '/library', icon: Library },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];
}

export function AdminSidebarItems(): NavItem[] {
  return [
    { label: 'Dashboard', href: '/admin', icon: Dashboard },
    { label: 'Installers', href: '/admin/installers', icon: Users },
    { label: 'Equipment', href: '/admin/equipment', icon: Database },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ];
}
```

- [ ] **Step 3: Update `apps/web/app/(app)/layout.tsx`**

Modify the existing layout to include TopNav and Sidebar:

```tsx
import { TopNav } from '@/components/nav/top-nav';
import { Sidebar, InstallerSidebarItems } from '@/components/nav/sidebar';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TopNav title="Installer" showUser={true} />
      <div className="flex">
        <Sidebar items={InstallerSidebarItems()} />
        <div className="flex-1">{children}</div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Update `apps/web/app/admin/(protected)/layout.tsx`**

Modify to include TopNav and Admin Sidebar:

```tsx
import { TopNav } from '@/components/nav/top-nav';
import { Sidebar, AdminSidebarItems } from '@/components/nav/sidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TopNav title="Admin Panel" showUser={true} />
      <div className="flex">
        <Sidebar items={AdminSidebarItems()} isAdmin={true} />
        <div className="flex-1">{children}</div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/nav/ apps/web/app/(app)/layout.tsx apps/web/app/admin/(protected)/layout.tsx
git commit -m "feat(web): add navigation bar and sidebar with icons"
```

---

### Task 13: Add Icons to Equipment CRUD List Pages (Batch 1)

**Files:**
- Modify: `apps/web/app/admin/(protected)/equipment/pv-modules/page.tsx`
- Modify: `apps/web/app/admin/(protected)/equipment/inverters/page.tsx`
- Modify: `apps/web/app/admin/(protected)/equipment/spds/page.tsx`

**Interfaces:**
- Consumes: Equipment icons from `@dossipv/icons`
- Produces: Icon-rich equipment list pages

---

- [ ] **Step 1: Update PvModule list page**

```tsx
// apps/web/app/admin/(protected)/equipment/pv-modules/page.tsx
import { PvModule, Plus, Edit, Trash2 } from '@dossipv/icons';
import Link from 'next/link';

export default function PvModulesPage() {
  // TODO: Fetch modules from DB
  const modules = [];

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
          <PvModule size="lg" className="icon-gold" />
          PV Modules
        </h1>
        <Link
          href="/admin/equipment/pv-modules/new"
          className="flex items-center gap-2 px-4 py-2 bg-gold text-white rounded-lg hover:bg-orange transition-colors"
        >
          <Plus size="sm" />
          Add Module
        </Link>
      </div>

      {/* Table with icons */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 font-semibold text-navy">Type</th>
              <th className="text-left px-6 py-3 font-semibold text-navy">Name</th>
              <th className="text-left px-6 py-3 font-semibold text-navy">Specs</th>
              <th className="text-right px-6 py-3 font-semibold text-navy">Actions</th>
            </tr>
          </thead>
          <tbody>
            {modules.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No PV modules yet. Create one to get started.
                </td>
              </tr>
            ) : (
              modules.map((module) => (
                <tr key={module.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <PvModule size="md" className="icon-gold" />
                  </td>
                  <td className="px-6 py-4 font-medium text-navy">{module.name}</td>
                  <td className="px-6 py-4 text-gray-600">{module.model}</td>
                  <td className="px-6 py-4 flex justify-end gap-2">
                    <Link href={`/admin/equipment/pv-modules/${module.id}`}>
                      <Edit size="sm" className="text-blue-600 hover:text-blue-800" />
                    </Link>
                    <button>
                      <Trash2 size="sm" className="text-red-600 hover:text-red-800" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Update Inverter list page**

Similar pattern with `Inverter` icon:

```tsx
// apps/web/app/admin/(protected)/equipment/inverters/page.tsx
import { Inverter, Plus, Edit, Trash2 } from '@dossipv/icons';
// ... same structure as PvModule
```

- [ ] **Step 3: Update SPD list page**

Similar pattern with `Spd` icon:

```tsx
// apps/web/app/admin/(protected)/equipment/spds/page.tsx
import { Spd, Plus, Edit, Trash2 } from '@dossipv/icons';
// ... same structure
```

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/admin/(protected)/equipment/pv-modules/page.tsx" "apps/web/app/admin/(protected)/equipment/inverters/page.tsx" "apps/web/app/admin/(protected)/equipment/spds/page.tsx"
git commit -m "feat(equipment): add icons to PvModule, Inverter, SPD list pages"
```

---

### Task 14: Add Icons to Equipment CRUD List Pages (Batch 2)

**Files:**
- Modify: `apps/web/app/admin/(protected)/equipment/dc-switches/page.tsx`
- Modify: `apps/web/app/admin/(protected)/equipment/dc-fuses/page.tsx`
- Modify: `apps/web/app/admin/(protected)/equipment/ac-breakers/page.tsx`

---

- [ ] **Step 1-3: Update each file with appropriate icon**

(Same pattern as Task 13, using `DcSwitch`, `DcFuse`, `AcBreaker` icons respectively)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/admin/(protected)/equipment/dc-switches/page.tsx" "apps/web/app/admin/(protected)/equipment/dc-fuses/page.tsx" "apps/web/app/admin/(protected)/equipment/ac-breakers/page.tsx"
git commit -m "feat(equipment): add icons to DC/AC protection equipment list pages"
```

---

### Task 15: Add Icons to Equipment CRUD List Pages (Batch 3)

**Files:**
- Modify: `apps/web/app/admin/(protected)/equipment/ac-isolators/page.tsx`
- Modify: `apps/web/app/admin/(protected)/equipment/cables/page.tsx`
- Modify: `apps/web/app/admin/(protected)/equipment/accessories/page.tsx`

---

- [ ] **Step 1-3: Update each file with appropriate icon**

(Same pattern, using `AcIsolator`, `Cable`, `Accessory` icons respectively)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/admin/(protected)/equipment/ac-isolators/page.tsx" "apps/web/app/admin/(protected)/equipment/cables/page.tsx" "apps/web/app/admin/(protected)/equipment/accessories/page.tsx"
git commit -m "feat(equipment): add icons to remaining equipment list pages"
```

---

### Task 16: Add Icons to Project & Simulation Views

**Files:**
- Modify: `apps/web/app/(app)/projects/page.tsx` (add project list icons)
- Modify: `apps/web/app/(app)/projects/[id]/page.tsx` (add project detail icons)
- Modify: `apps/web/app/(app)/projects/[id]/sections/forms/simulation-form.tsx` (add chart icons)

**Interfaces:**
- Consumes: `Projects`, `ChartLine`, `TrendUp` icons

---

- [ ] **Step 1: Update projects list page**

```tsx
// apps/web/app/(app)/projects/page.tsx
import { Projects, Plus, Download, Trash2 } from '@dossipv/icons';
import Link from 'next/link';

export default function ProjectsPage() {
  const projects = [];

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
          <Projects size="lg" className="icon-gold" />
          Projects
        </h1>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-4 py-2 bg-gold text-white rounded-lg hover:bg-orange"
        >
          <Plus size="sm" />
          New Project
        </Link>
      </div>

      {/* Cards view */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-100"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-navy">{project.name}</h3>
                <p className="text-sm text-gray-600">{project.client}</p>
              </div>
              <Projects size="md" className="icon-gold" />
            </div>
            <div className="text-sm text-gray-600">
              <p>Capacity: {project.capacity} kWp</p>
              <p>Status: {project.status}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Update project detail page**

Add icons to the project header and sections (array form, cabling, etc.)

- [ ] **Step 3: Update simulation form**

Add `ChartLine` icon to the simulation section

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(app)/projects/page.tsx" "apps/web/app/(app)/projects/[id]/page.tsx" "apps/web/app/(app)/projects/[id]/sections/forms/simulation-form.tsx"
git commit -m "feat(projects): add icons to project list and simulation views"
```

---

### Task 17: Add Icons to Map Editor

**Files:**
- Modify: `apps/web/app/(app)/projects/[id]/map/page.tsx`

**Interfaces:**
- Consumes: `Map`, `Polygon`, `MarkerTech`, `MarkerMeter`, `MarkerEarth`, `Compass` icons

---

- [ ] **Step 1: Update map page**

```tsx
// Add icons to map controls and markers
import { Map, Polygon, Compass, DrawTools, ZoomIn, ZoomOut } from '@dossipv/icons';
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/app/(app)/projects/[id]/map/page.tsx"
git commit -m "feat(map): add icons to map editor controls and markers"
```

---

### Task 18: Run All Tests & Verify

**Files:**
- No new files; validation only

---

- [ ] **Step 1: Run icon component tests**

```bash
cd packages/icons && npm test
```

Expected: All icon component tests pass (basic render checks)

- [ ] **Step 2: Run workspace tests**

```bash
npm test
```

Expected: All 419+ tests pass (including new icon tests)

- [ ] **Step 3: Type check**

```bash
npm run tsc
```

Expected: No TypeScript errors

- [ ] **Step 4: Lint check**

```bash
npm run lint
```

Expected: No ESLint errors (ignore icon naming conventions if they differ from lint style)

- [ ] **Step 5: Commit (if needed)**

If tests fail and fixes are needed:

```bash
git add .
git commit -m "fix: resolve test failures in icon system"
```

---

### Task 19: Visual Verification in Browser

**Files:**
- No new files; live testing only

---

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: `next dev` starts successfully on port 3000

- [ ] **Step 2: Verify landing page**

Navigate to `http://localhost:3000`:
- 3D logo renders
- "Click anywhere" dismisses hero
- Features section shows 3 cards with icons
- Footer has CTA buttons

- [ ] **Step 3: Verify installer dashboard**

Login and navigate to `/dashboard`:
- 4 metric cards render with icons
- Icons display in gold color
- Sidebar shows navigation icons
- Top nav shows logo + user menu

- [ ] **Step 4: Verify admin dashboard**

Login as admin, navigate to `/admin`:
- 4 admin metric cards render
- Icons display correctly
- Installer management link works

- [ ] **Step 5: Verify equipment pages**

Navigate to `/admin/equipment/pv-modules`:
- List page shows equipment type icon
- Add button with icon works
- Table rows show action icons (edit, delete)

- [ ] **Step 6: Document findings**

If any visual issues found (alignment, colors, sizing), create a follow-up task in the spec

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "test(web): verify UI redesign in browser — landing, dashboards, equipment pages"
```

---

### Task 20: Final Polish & Documentation

**Files:**
- Create: `docs/superpowers/guides/ICON_SYSTEM.md` (optional reference for future developers)

---

- [ ] **Step 1: Create icon system documentation**

```markdown
# SOLARIX PRO Icon System Guide

## Overview
Custom SVG icon system built with React components, organized by category.

## Icon Packages
- Navigation: Home, Dashboard, Projects, Library, Settings, Logout, Menu, Close, Search
- Equipment: PvModule, Inverter, Spd, DcSwitch, DcFuse, AcBreaker, AcIsolator, Cable, Accessory
- Actions: Edit, Delete, Add, Check, Error, Warning, Info, Loading, Eye, EyeOff
- Data: ChartBar, ChartLine, Statistics, TrendUp, KwHours, Co2Saved, Revenue
- Map: Map, LocationPin, Polygon, MarkerTech, MarkerMeter, MarkerEarth, Compass
- Admin: Users, Company, Subscription, Payment, Lock, Unlock, Shield, Database

## Usage
```tsx
import { Home, PvModule, Edit } from '@dossipv/icons';

<Home size="md" color="gold" />
<PvModule size="lg" className="icon-gold" />
<Edit size="sm" />
```

## Sizing
- xs: 16px | sm: 20px | md: 24px | lg: 32px | xl: 48px

## Colors
- inherit (default) | gold | orange | success | error | warning | info

## Adding New Icons
1. Determine category (navigation, equipment, actions, etc.)
2. Create SVG path in the appropriate `categories/*.tsx` file
3. Export from `index.ts`
4. Use throughout the app

## Color Palette
- Gold: #FFA500
- Orange: #FF8C00
- Navy: #1A2332
- Success: #10B981
- Error: #EF4444
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/guides/ICON_SYSTEM.md
git commit -m "docs: add SOLARIX PRO icon system guide"
```

---

## Summary

**Total Tasks: 20**

**Phase Breakdown:**
1. **Foundation (Tasks 1-6):** Icon system package + base components + color palette + logo
2. **Landing Page (Tasks 7-8):** Components + root route
3. **Dashboard Redesign (Tasks 9-11):** Card components + installer + admin dashboards
4. **Navigation (Task 12):** Top nav + sidebar
5. **Equipment CRUD (Tasks 13-15):** Icons on all 9 equipment type list pages
6. **App Views (Tasks 16-17):** Projects, simulation, map editor
7. **Testing & Polish (Tasks 18-20):** Tests + browser verification + documentation

**Output:**
- ✅ 40+ custom SVG icons, categorized and reusable
- ✅ Landing page with 3D logo (dismissible hero)
- ✅ Color palette (Solar Gold/Orange/Navy) applied globally
- ✅ Icon-rich dashboards (installer & admin)
- ✅ Navigation sidebar with icons
- ✅ All equipment CRUD pages with type-specific icons
- ✅ Project, simulation, and map views updated
- ✅ All tests passing (419+ baseline + new tests)
- ✅ Type-safe implementation via TypeScript

---

**Plan complete and saved to `docs/superpowers/plans/2026-10-03-solarix-pro-ui-redesign.md`.**

Please review the plan. Does it capture what you want, and which execution approach should we use?

- **Subagent-driven** — A fresh subagent implements each task and a fresh reviewer checks it, then a whole-branch review at the end. Most thorough; costs fresh context per task.
- **Native** — I implement every task myself in this session, then one fresh reviewer on the whole branch. Fastest; no independent review until the end.

**For this plan I recommend Subagent-driven**, because:
- 20 tasks with moderate complexity (icon SVG paths, React component composition, form updates)
- High visibility: every icon across the app, so consistency matters
- Independent task review ensures no stale patterns slip through
- A fresh reviewer at the end catches visual/UX issues an implementer might miss

Which approach would you prefer?