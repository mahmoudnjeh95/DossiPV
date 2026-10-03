# SOLARIX PRO Icon System

Custom SVG React icon system at `packages/icons/`. Zero external icon library dependencies.

## Usage

```tsx
import { Home, PvModule, Edit } from '@dossipv/icons';

<Home size="md" color="gold" />
<PvModule size="lg" color="orange" />
<Edit size="sm" />
```

## Sizes

| Prop | px |
|------|----|
| `xs` | 16 |
| `sm` | 20 |
| `md` | 24 (default) |
| `lg` | 32 |
| `xl` | 48 |

## Colors

| Prop | Value |
|------|-------|
| `inherit` | `currentColor` (default) |
| `gold` | `#FFA500` |
| `orange` | `#FF8C00` |
| `success` | `#10B981` |
| `error` | `#EF4444` |
| `warning` | `#F59E0B` |
| `info` | `#3B82F6` |

## Icon Categories

**Navigation:** `Home`, `Dashboard`, `Projects`, `Library`, `Settings`, `Logout`, `Menu`, `Close`, `Search`

**Equipment:** `PvModule`, `Inverter`, `Spd`, `DcSwitch`, `DcFuse`, `AcBreaker`, `AcIsolator`, `Cable`, `Accessory`

**Actions:** `Edit`, `Delete`, `Add`, `Check`, `Error`, `Warning`, `Info`, `Loading`, `Eye`, `EyeOff`

**Data:** `ChartBar`, `ChartLine`, `Statistics`, `TrendUp`, `KwHours`, `Co2Saved`, `Revenue`

**Map:** `Map`, `LocationPin`, `Polygon`, `MarkerTech`, `MarkerMeter`, `MarkerEarth`, `Compass`

**Admin:** `Users`, `Company`, `Subscription`, `Payment`, `Lock`, `Unlock`, `Shield`, `Database`

**3D Logo:** `SolarixProLogo` — sizes `sm` (64px), `md` (120px), `lg` (200px), `xl` (240px)

## Adding New Icons

1. Choose the right category file under `packages/icons/src/categories/`
2. Add a new `wrapIcon(name, path)` call and export it
3. Add the export to `packages/icons/src/index.ts`
4. Use it anywhere in the app with `import { MyIcon } from '@dossipv/icons'`

## Implementation Note

Equipment icons use `fill="currentColor" fillOpacity="0.2"` for a subtle filled look. All other
icons are stroke-only (`fill="none"`). The `wrapIcon` factory resolves `size` → px and
`color` → hex before rendering, so both props work correctly regardless of CSS context.
