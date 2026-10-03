# SOLARIX PRO UI Redesign Specification

**Date:** 2026-10-03  
**Status:** Approved Design  
**Scope:** Landing page, comprehensive icon system, branded dashboard & views

---

## 1. Visual Identity & Brand Language

### 1.1 Color Palette

**Primary Colors (Solar/Energy Theme):**
- **Solar Gold:** `#FFA500` (primary brand, calls-to-action, highlights)
- **Sun Orange:** `#FF8C00` (secondary, interactive elements, hover states)
- **Warm Yellow:** `#FFD700` (accents, badges, achievements)
- **Deep Navy:** `#1A2332` (backgrounds, text, professional grounding)
- **Light Gray:** `#F5F5F5` (surfaces, cards, neutral backgrounds)
- **Neutral Dark:** `#333333` (primary text)
- **Neutral Light:** `#CCCCCC` (borders, disabled states)

**Semantic Colors:**
- Success: `#10B981` (green)
- Warning: `#F59E0B` (amber)
- Error: `#EF4444` (red)
- Info: `#3B82F6` (blue)

### 1.2 Typography

- **Font Stack:** System fonts (Inter, Segoe UI, or Helvetica Neue) for performance
- **Headlines:** Bold, 24-32px (landing), 18-24px (dashboard)
- **Body:** Regular, 14-16px
- **Captions:** 12-14px, secondary gray text

### 1.3 3D Logo: SOLARIX PRO

**Concept:** Stylized sun/solar-panel hybrid in 3D isometric view
- **Shape:** Concentric circles (sun rays) emerging from a tilted panel base
- **Material:** Metallic gold gradient with subtle shadow for depth
- **Usage:**
  - Landing hero: Large (200-240px)
  - Navigation bar: Small (40-48px)
  - Favicon: Simplified (32px)
  - Marketing: Medium (120-150px)

**Deliverable:** SVG with embedded gradients + optional Three.js 3D rotation on landing (see §3.1)

---

## 2. Custom SVG Icon System

### 2.1 Icon Categories & Naming

**Navigation & UI (16px base, stroke-based):**
- `icon-home`, `icon-dashboard`, `icon-projects`, `icon-library`, `icon-settings`, `icon-logout`, `icon-menu`, `icon-close`, `icon-search`

**Projects & Documents (18px base):**
- `icon-project`, `icon-new-project`, `icon-dossier`, `icon-download`, `icon-upload`, `icon-file-docx`, `icon-file-pdf`, `icon-share`, `icon-archive`

**Equipment Types (24px, thematic):**
- `icon-pv-module` (panel grid)
- `icon-inverter` (connected nodes/converter box)
- `icon-spd` (lightning bolt shielded)
- `icon-dc-switch` (toggle switch)
- `icon-dc-fuse` (fuse cylinder)
- `icon-ac-breaker` (circuit breaker)
- `icon-ac-isolator` (isolator switch)
- `icon-cable` (twisted pair)
- `icon-accessory` (plus/component)

**Map & Geometry (20px):**
- `icon-map`, `icon-location-pin`, `icon-polygon`, `icon-marker-tech`, `icon-marker-meter`, `icon-marker-earth`, `icon-compass`

**Actions & Status (18px):**
- `icon-edit`, `icon-delete`, `icon-add`, `icon-check`, `icon-error`, `icon-warning`, `icon-info`, `icon-loading`, `icon-eye`, `icon-eye-off`

**Data & Analytics (20px):**
- `icon-chart-bar`, `icon-chart-line`, `icon-statistics`, `icon-trend-up`, `icon-kw-hours`, `icon-co2-saved`, `icon-revenue`

**Admin & Settings (18px):**
- `icon-users`, `icon-company`, `icon-subscription`, `icon-payment`, `icon-lock`, `icon-unlock`, `icon-shield`, `icon-database`

### 2.2 Icon Style Guidelines

**Design Principles:**
- **Consistency:** Uniform stroke width (1.5-2px for outlines, 0.8px for details)
- **Simplicity:** Minimal details, geometric/clean shapes
- **Scalability:** Works at 16px–48px without loss of clarity
- **Color:** 
  - Monochrome by default (inherit text color or use CSS `currentColor`)
  - Accent variants use Solar Gold or Orange for highlights/badges
  - Equipment icons: Use Solar Gold fill with Navy outlines

**SVG Structure:**
```jsx
<svg viewBox="0 0 24 24" width="24" height="24" className="icon icon-name">
  <path d="..." stroke="currentColor" strokeWidth="1.5" fill="none" />
</svg>
```

### 2.3 Icon Component Implementation

**Location:** `apps/web/components/icons/` (new directory)

**Structure:**
```
apps/web/components/icons/
  ├── Icon.tsx          // Base wrapper component
  ├── index.ts          // Re-exports
  ├── navigation/
  │   ├── Home.tsx
  │   ├── Dashboard.tsx
  │   └── ...
  ├── equipment/
  │   ├── PvModule.tsx
  │   ├── Inverter.tsx
  │   └── ...
  ├── actions/
  │   ├── Edit.tsx
  │   ├── Delete.tsx
  │   └── ...
  └── data/
      ├── ChartBar.tsx
      └── ...
```

**Base Icon Component:**
```tsx
interface IconProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; // 16 | 20 | 24 | 32 | 48px
  color?: 'inherit' | 'gold' | 'orange' | 'success' | 'error';
  className?: string;
}

export function Icon({ size = 'md', color = 'inherit', ...props }: IconProps) {
  const sizeMap = { xs: 16, sm: 20, md: 24, lg: 32, xl: 48 };
  const colorMap = {
    inherit: 'currentColor',
    gold: '#FFA500',
    orange: '#FF8C00',
    success: '#10B981',
    error: '#EF4444',
  };
  return (
    <svg width={sizeMap[size]} height={sizeMap[size]} {...props}>
      {/* SVG content */}
    </svg>
  );
}
```

---

## 3. Landing Page (Unauthenticated)

### 3.1 Page Structure

**Route:** `/` (root, before login)

**Sections:**
1. **Hero Section** (viewport height)
   - 3D SOLARIX PRO logo (center, animated rotation or parallax on scroll)
   - Headline: "Professional PV Dossier Generation"
   - Subheadline: "Streamline your STEG technical documentation"
   - CTA buttons: "Login" (outline), "Get Started" (solid gold)
   - Clickable overlay: Any click/tap dismisses to next section or login

2. **Features Section** (3-column cards)
   - **Precision:** Icon + short text
   - **Speed:** Icon + short text
   - **Compliance:** Icon + short text
   - Each card has a custom SVG icon (thematic)

3. **Call-to-Action Footer**
   - "Ready to simplify your workflow?"
   - Login link + Signup link
   - Company branding/copyright

### 3.2 Visual Design

**Layout:**
- Full-width responsive (mobile-first)
- Hero: Centered, 80% width max on desktop
- Cards: Grid (1 column mobile, 3 columns desktop)
- Footer: Simple, aligned left

**Color Application:**
- Background: White or `#FAFAFA`
- Accent elements: Solar Gold buttons, Orange hovers
- Text: Deep Navy for headlines, Neutral Dark for body
- Logo: 3D gold/orange gradient

**Interactive Elements:**
- Buttons: `background: #FFA500`, `color: white`, rounded corners (8px)
- Hover: Darken to `#FF8C00` with subtle shadow
- Dismissal: Click anywhere on hero → scroll to features or redirect to login
- Smooth transitions (300ms)

### 3.3 Mobile Behavior

- Stacked layout (1 column)
- Touch-friendly tap targets (48px min)
- Logo scales: 120px (mobile), 200px (desktop)
- Simplified feature cards (text + icon, no extra graphics)

---

## 4. Dashboard & Authenticated Views

### 4.1 Navigation Bar (All Pages)

**Top Navigation:**
- Left: SOLARIX PRO logo (small, 40px) + app name
- Center: Breadcrumbs or section title
- Right: User profile dropdown + settings icon + logout

**Icons Used:**
- Logo: Custom 3D logo (40px)
- Settings: `icon-settings` (20px, Navy)
- Profile: `icon-user` (20px, Navy)
- Logout: `icon-logout` (20px, Navy)

**Colors:**
- Background: White or Light Gray
- Text: Navy
- Accent: Gold on hover

### 4.2 Sidebar/Navigation (Admin & Installer Views)

**Admin Panel Sidebar:**
- Dashboard: `icon-dashboard`
- Installers: `icon-users`
- Equipment: `icon-database` (with submenu icons: PvModule, Inverter, etc.)
- Settings: `icon-settings`
- Logout: `icon-logout`

**Installer Dashboard Sidebar:**
- Dashboard: `icon-dashboard`
- Projects: `icon-projects`
- Library: `icon-library`
- Settings: `icon-settings`
- Logout: `icon-logout`

**Styling:**
- Background: Deep Navy or Light Gray
- Icons: 20px, Navy text (light theme) or Gold (dark theme option)
- Active state: Gold background or underline
- Hover: Subtle gold overlay

### 4.3 Dashboard Cards & Metrics

**Installer Dashboard Sections:**

1. **Quick Stats (4-column grid)**
   - Active Projects: `icon-project` + count
   - Dossiers Generated: `icon-file-pdf` + count
   - This Month (KWh Capacity): `icon-kw-hours` + value
   - Team Members: `icon-users` + count
   - **Card styling:** White background, Navy text, Gold icon highlights, rounded (12px), shadow

2. **Recent Projects (Table/List)**
   - Icon + Project Name + Status Badge + Actions
   - Icons: `icon-project` (name), status colored badges, action icons (`icon-edit`, `icon-delete`, `icon-download`)

3. **Quick Actions (Button Group)**
   - New Project: `icon-new-project` + text
   - Upload Library: `icon-upload` + text
   - Download Dossier: `icon-download` + text
   - **Styling:** Outlined buttons with gold border, hover fill with gold

### 4.4 Admin Dashboard

**Dashboard Sections:**

1. **Key Metrics (4-column)**
   - Active Installers: `icon-users`
   - Dossiers This Month: `icon-file-pdf`
   - Claude Cost: `icon-revenue`
   - Total Revenue: `icon-trend-up`
   - **Same card styling as installer dashboard**

2. **Installer Table**
   - Company icon + name, subscription status, actions
   - Status badges (Active/Suspended): Colored (success green / warning red)
   - Action icons: `icon-edit`, `icon-delete`, `icon-download`

### 4.5 Equipment CRUD Pages

**List Page:**
- Table/Grid with icons for each equipment type
- Icon column: Equipment-specific icon (e.g., `icon-pv-module` for modules)
- Columns: Icon, Name, Model, Specs (summary), Actions (edit/delete)
- Action buttons: Outlined style, gold on hover
- **Add New button:** Gold filled, icon-add

**Detail/Edit Pages:**
- Equipment icon (large, 48px) in header
- Form fields with input icons (optional, for major inputs)
- Save/Cancel buttons: Gold (save), Gray (cancel)

### 4.6 Map Editor

**Icons:**
- `icon-map` in header
- `icon-polygon` for draw mode
- `icon-marker-tech`, `icon-marker-meter`, `icon-marker-earth` for pins
- `icon-compass` for orientation
- Draw/pan/zoom controls with appropriate icons

**Color:** Icons in Navy, Gold on active state

### 4.7 Simulation & Document Views

**Simulation Section:**
- `icon-chart-line` for graph/trends
- `icon-upload` for PVsyst report upload
- Status: `icon-check` (success), `icon-loading` (in progress), `icon-error` (failed)

**Document Generation:**
- `icon-file-docx`, `icon-file-pdf` for output types
- `icon-download` for file downloads
- Status badges with icons

---

## 5. Color & Icon Usage Rules

### 5.1 Icon Color Semantics

| Use Case | Color | Icon Style |
|----------|-------|-----------|
| Navigation (inactive) | Navy (#333333) | Stroke or outline |
| Navigation (active) | Gold (#FFA500) | Filled or highlighted |
| Primary actions | Gold (#FFA500) | Filled |
| Secondary actions | Orange (#FF8C00) | Outlined |
| Success status | Green (#10B981) | Filled |
| Error status | Red (#EF4444) | Filled |
| Warning status | Amber (#F59E0B) | Filled |
| Disabled state | Light Gray (#CCCCCC) | Outlined |

### 5.2 Icon Sizing Guidelines

| Context | Size | Example |
|---------|------|---------|
| Navigation bar | 20px | Home, Settings, Logout |
| Sidebar menu | 20px | Dashboard, Projects |
| Dashboard cards | 32px | Metrics icons |
| Equipment list | 24px | Type identifier icons |
| Buttons/Actions | 18px | Edit, Delete, Download |
| Badges/Status | 16px | Status indicators |
| Form inputs (optional) | 16px | Input field left icons |
| 3D Logo | 40-240px | Responsive sizing |

---

## 6. Implementation Approach

### 6.1 Technology Stack

**Icon Delivery:**
- SVG files (inline React components, not `<img>` tags)
- No external icon library (custom-built)
- CSS-in-JS for color/size variants (optional: Tailwind utility classes)

**3D Logo:**
- Static SVG with gradient (fast, no JS overhead)
- Optional: Three.js or Spline embed for animated rotation (landing hero only, lazy-loaded)

**Landing Page:**
- Next.js page component (`apps/web/app/page.tsx`)
- Responsive design with Tailwind (or custom CSS)
- Dismissible overlay (state-based or URL redirect)

**Dashboard Components:**
- Reusable card components with slot-based icon injection
- Color theming via CSS variables or Tailwind classes
- Icon imports from `@dossipv/icons` (new package) or directly from `apps/web/components/icons/`

### 6.2 File Structure

**Icons Package (new):**
```
packages/icons/ (or apps/web/components/icons/)
  ├── package.json
  ├── src/
  │   ├── index.ts
  │   ├── Icon.tsx (base wrapper)
  │   ├── navigation/
  │   ├── equipment/
  │   ├── actions/
  │   ├── data/
  │   └── types.ts (IconProps, SizeType, ColorType)
```

**App Integration:**
```
apps/web/
  ├── app/
  │   ├── page.tsx (landing page)
  │   ├── login/
  │   ├── (app)/
  │   │   ├── dashboard/page.tsx (with icon cards)
  │   │   └── ...
  │   └── admin/
  │       └── (protected)/
  │           ├── page.tsx (admin dashboard)
  │           ├── equipment/
  │           └── ...
  └── components/
      └── ... (reusable card, button, layout components)
```

### 6.3 Styling Approach

**Option A: Tailwind CSS** (if project uses it)
```tsx
<div className="bg-gray-50 rounded-xl shadow-sm border border-gray-200">
  <Home size="lg" className="text-orange-500" />
  <p className="text-navy-900">Active Projects</p>
</div>
```

**Option B: CSS Variables + Modules**
```tsx
<div className={styles.card}>
  <Home size="lg" style={{ color: 'var(--color-gold)' }} />
</div>
```

### 6.4 Testing & Validation

- Unit tests: Icon component renders correctly at all sizes and colors
- Visual regression: Screenshot tests for cards/dashboard layouts
- Accessibility: Icons have proper `aria-label` when used standalone
- Performance: SVG sizes optimized (<2KB per icon avg), no unnecessary re-renders

---

## 7. Deferred & Non-Scope

**Out of scope for this spec:**
- Animated icon transitions (can be added later)
- Dark mode theming (can be layered on top)
- Advanced 3D animations (static SVG + optional enhancement)
- Internationalization of UI labels (assumed English/French already handled)

---

## 8. Success Criteria

✅ Custom SVG icon system with 40+ icons covering all app sections  
✅ Modern, minimalist landing page with dismissible hero  
✅ 3D SOLARIX PRO logo implemented (SVG + optional animated variant)  
✅ All dashboard cards and lists display contextual icons  
✅ Consistent orange/gold/navy color palette across all views  
✅ Icons scale responsively (mobile to desktop)  
✅ Equipment CRUD pages show type-specific icons  
✅ Admin dashboard metrics use clear visual indicators  
✅ All interactive states (hover, active, disabled) use color coding  
✅ Zero external icon library dependencies (fully custom)

---

**Next Step:** Writing implementation plan (writing-plans skill) to break this spec into implementation tasks.
