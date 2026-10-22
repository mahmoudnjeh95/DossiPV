---
name: pv-electrical-drawings
description: Conventions and techniques for drawing the electrical diagrams of a Tunisian STEG BT photovoltaic dossier technique — single-line diagram (schéma unifilaire), string / DC-box / AC-box wiring diagrams, implantation and situation plans — as vector graphics in PDF with pdf-lib. Use whenever code in packages/dossier-worker (render-drawings.ts, render-site-plan-pages.ts) or any task draws, redesigns or reviews these diagrams.
---

# PV electrical drawings for STEG BT dossiers

The STEG reviewer reads the drawings first. A drawing is accepted when every device shown in the
calculation notes appears on it, with its rating, in the order the current flows, with earthing,
and inside a title block. Box diagrams with labels only are refused.

## Reference first
Before drawing, open the human-made reference dossier at the repo root
(`Dossier Technique - 434 - 303 - *.pdf`, gitignored, real client data — never copy it into git)
and look at its single-line and wiring pages (view them as images). Match its structure, symbol
style and title block. The gap report is
`.superpowers/sdd/2026-10-21-steg-bill-to-dossier/acceptance/reference-comparison.md`.

## Single-line diagram (schéma unifilaire) — content, left → right (or top → bottom)
1. PV field: N strings × Ns modules, module brand/model/Pmax, kWc total, Voc/Isc of the string at Tmin/Tmax.
2. DC cable: type (H1Z2Z2-K), section mm², length m.
3. DC box (coffret DC): string fuses gPV (rating A / 1000 V) only when required; DC switch-disconnector
   (In A, Ue V, poles); DC surge protector type 2 (Uc, Up, In, Iscpv).
4. Inverter: brand/model, Pac kW, MPPT count, single-phase, STEG-accepted mention.
5. AC cable: type (U1000 R2V), section, length.
6. AC box (coffret AC): AC breaker (In A, curve C, 2P); 30 mA residual-current device (type A or as
   specified); AC surge protector type 2 (Uc, Up, In).
7. Building switchboard / AGCP (disjoncteur de branchement STEG, rating from the subscribed power ladder:
   2→10 A … 7→32 A … 14→63 A), then the STEG bidirectional meter, then the BT grid.
8. Earthing: PE conductor (section) from module frames, structure, DC/AC boxes and inverter to the main
   earthing terminal, earth rod(s) count × length, target resistance Ω. Equipotential bonding shown.
Every device: symbol + reference designation (e.g. Q1, F1, SPD1) + rating text next to it.

## Symbols (IEC 60617 style) — draw as SVG path data with `page.drawSvgPath(path, { x, y, scale, borderColor, borderWidth })`
- PV module/string: rectangle with a diagonal and a small sun/arrows mark; string = stacked modules with "×Ns".
- Fuse: small rectangle on the conductor.
- Switch-disconnector: break in the line with an angled blade + small bar (isolating function).
- Circuit breaker: angled blade + cross "×" at the fixed contact.
- RCD (différentiel): breaker symbol + toroid ellipse around the conductors + "30 mA".
- Surge protector: rectangle with a downward arrow/zig-zag to earth.
- Inverter: square with a diagonal, "=" in the upper-left triangle and "~" in the lower-right.
- Meter: circle or rectangle with "kWh" and a double arrow (bidirectional).
- Earth: three decreasing horizontal bars; PE conductor in green-yellow (or dashed + "PE" label in monochrome).
Keep one symbol module (e.g. `drawing-symbols.ts`) exporting path strings + anchor points so every
diagram reuses the same symbols; unit-test the anchors, not pixels.

## Layout rules
- A3 or A4 landscape page with a 10 mm frame; title block (cartouche) bottom-right: project title,
  client ("le client" in tests), site commune, installer company + ANME code, drawing title, number,
  revision, date, scale "sans échelle", page x/y.
- Conductors: DC + in red, DC − in black/blue, AC phase brown, neutral blue, PE green-yellow; if printed
  monochrome, label every conductor. Line width ≥ 0.8 pt; text ≥ 7 pt; never overlap text and lines —
  compute text widths with the embedded font (`font.widthOfTextAtSize`).
- Ratings come from the SAME snapshot values the calculation notes print (never re-derive in the
  drawing code) so the drawing and the notes can never disagree.
- Long labels wrap; if a diagram does not fit, scale the whole group, never shrink text below 7 pt.

## Implantation / situation plans (every tier)
- Situation: satellite tile (Esri, max native zoom 18) centred on the site GPS, north arrow, scale bar,
  GPS in DMS.
- Implantation: same imagery zoomed, with the four coloured points (Champ PV yellow #F5B800, local
  technique blue #1E6FD9, compteur STEG red #D93025, piquet de terre green #1E8E3E), cable routes as lines
  with their computed lengths, legend.
- Premium additionally gets the AI-reasoned layout (panel rows on the roof); Standard must still get the
  points, routes, legend and GPS — never an empty "À compléter" frame.

## Verification
Render the generated PDF pages to images and LOOK at them (Read tool on the PDF with `pages`) next to
the reference pages before reporting done; a checklist of the 8 single-line items above must all be
visible with values.
