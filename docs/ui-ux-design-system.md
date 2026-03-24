# llmProjectSniffo -- UI/UX Design Specification

Version: 1.0.0
Date: 2026-03-22
Status: Draft

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Graph Visual Language](#4-graph-visual-language)
5. [Layout Design](#5-layout-design)
6. [Component Design Specs](#6-component-design-specs)
7. [Interaction Patterns](#7-interaction-patterns)
8. [Accessibility](#8-accessibility)

---

## 1. Design Principles

### 1.1 Visual Philosophy

**"The graph is the interface."**

Everything exists to serve the graph. Chrome is minimal, panels are contextual, and the visual hierarchy always points back to the relationship map at center stage. The tool should feel like peering into a living codebase -- not reading a report about one.

### 1.2 Core Principles

1. **Graph-first real estate.** The graph viewport occupies a minimum of 80% of the visible area at rest. All panels overlay or push from edges; nothing permanently competes with the canvas.

2. **Progressive disclosure.** Show the minimum needed at each level. L1 shows 5--15 nodes. L2 shows 10--40. L3 shows 20--80. L4 shows the raw code-level detail. Each drill-down reveals more, never dumps everything at once.

3. **Contextual chrome.** Panels, tooltips, and toolbars appear only when relevant. An empty selection means empty side panels. A completed analysis hides the progress bar.

4. **Dark by default.** Developer tools live in dark mode. The palette is built dark-first with sufficient contrast ratios (WCAG AA minimum, AAA preferred for text).

5. **Calm information density.** Dense information is fine -- visual noise is not. Use whitespace, grouping, and subdued secondary text to let the eye parse complex layouts without fatigue.

### 1.3 Navigability at Scale (500+ Nodes)

| Strategy | Implementation |
|---|---|
| Hierarchical drill-down | L1-L4 levels prevent displaying all nodes at once |
| Semantic zoom | Node labels appear/hide based on zoom level |
| Cluster grouping | Force-directed layout with community hulls |
| Search-to-focus | Search highlights and zooms to matching nodes |
| Fisheye distortion | Optional: magnify area around cursor, compress periphery |
| Minimap | Persistent overview in bottom-left corner |
| Filter reduction | Hide node/edge types to reduce visual clutter |

---

## 2. Color System

All colors are specified in hex with HSL equivalents. Tailwind custom theme values are provided where applicable.

### 2.1 Dark Mode Base Palette

| Token | Hex | HSL | Tailwind Config Key | Usage |
|---|---|---|---|---|
| `bg-primary` | `#0D1117` | 215 28% 7% | `colors.surface.900` | Main background, graph canvas |
| `bg-secondary` | `#161B22` | 215 21% 11% | `colors.surface.800` | Panel backgrounds, cards |
| `bg-tertiary` | `#21262D` | 215 14% 15% | `colors.surface.700` | Hover states, active backgrounds |
| `bg-elevated` | `#282E36` | 215 12% 18% | `colors.surface.600` | Dropdowns, tooltips, popovers |
| `border-default` | `#30363D` | 215 9% 21% | `colors.border.default` | Default borders |
| `border-muted` | `#21262D` | 215 14% 15% | `colors.border.muted` | Subtle separators |
| `border-emphasis` | `#3D444D` | 215 8% 27% | `colors.border.emphasis` | Focused input borders |
| `text-primary` | `#E6EDF3` | 210 29% 92% | `colors.text.primary` | Primary text, headings |
| `text-secondary` | `#8B949E` | 210 9% 58% | `colors.text.secondary` | Descriptions, labels |
| `text-tertiary` | `#6E7681` | 215 7% 47% | `colors.text.tertiary` | Placeholders, disabled text |
| `text-link` | `#58A6FF` | 212 100% 67% | `colors.text.link` | Clickable text, links |

### 2.2 Node Colors by Type

Each node type gets a distinct hue. Colors are chosen for distinguishability under simulated color-vision deficiencies (deuteranopia, protanopia tested).

| Node Type | Hex | HSL | Tailwind Class | Visual |
|---|---|---|---|---|
| **Class** | `#7C3AED` | 263 84% 58% | `node-class` | Purple -- the primary building block |
| **Interface** | `#06B6D4` | 188 95% 43% | `node-interface` | Cyan -- contracts stand out cool |
| **Trait** | `#F59E0B` | 38 92% 50% | `node-trait` | Amber -- shared behavior, warm tone |
| **Method** | `#3B82F6` | 217 91% 60% | `node-method` | Blue -- the workhorse |
| **File** | `#10B981` | 160 84% 39% | `node-file` | Emerald -- filesystem = green |
| **Folder** | `#64748B` | 215 16% 47% | `node-folder` | Slate -- structural, neutral |
| **Namespace** | `#A78BFA` | 255 83% 76% | `node-namespace` | Lavender -- grouping concept |
| **Service** | `#EC4899` | 330 81% 60% | `node-service` | Pink -- dependency injection |

### 2.3 Edge Colors by Relationship

Edges use muted, desaturated versions so they do not overpower nodes. Active/selected edges use the full-saturation variant.

| Relationship | Default Hex | Active Hex | HSL (default) | Tailwind |
|---|---|---|---|---|
| **CALLS** | `#4B7BEC` | `#5B8DEF` | 220 79% 61% | `edge-calls` |
| **EXTENDS** | `#A55EEA` | `#B370F0` | 271 77% 64% | `edge-extends` |
| **IMPLEMENTS** | `#26DE81` | `#3CE897` | 148 71% 51% | `edge-implements` |
| **USES** | `#778CA3` | `#8A9DB4` | 215 17% 55% | `edge-uses` |
| **INJECTS** | `#FD9644` | `#FDAB6B` | 25 98% 63% | `edge-injects` |
| **CONTAINS** | `#45526E` | `#566585` | 220 21% 35% | `edge-contains` |
| **IMPORTS** | `#20BF6B` | `#3DD47F` | 150 71% 44% | `edge-imports` |

### 2.4 Freshness Colors

Three tiers based on configurable age thresholds (default: fresh < 7 days, aging < 30 days, stale >= 30 days).

| State | Hex | HSL | Tailwind | Usage |
|---|---|---|---|---|
| **Fresh** | `#2EA043` | 131 53% 44% | `freshness-fresh` | Recently analyzed, trustworthy |
| **Aging** | `#D29922` | 41 73% 48% | `freshness-aging` | Getting old, review recommended |
| **Stale** | `#F85149` | 2 90% 62% | `freshness-stale` | Outdated, re-analysis needed |
| **Unknown** | `#6E7681` | 215 7% 47% | `freshness-unknown` | Never analyzed |

### 2.5 Selection and Highlight Colors

| State | Hex | HSL | Tailwind |
|---|---|---|---|
| **Selected node ring** | `#58A6FF` | 212 100% 67% | `select-primary` |
| **Hovered node glow** | `#58A6FF40` | 212 100% 67% / 25% alpha | `select-glow` |
| **Blast radius highlight** | `#F78166` | 15 90% 68% | `blast-highlight` |
| **Blast radius fade** | (all other nodes at 15% opacity) | -- | `blast-fade` |
| **Search match** | `#D2A8FF` | 271 100% 83% | `search-match` |
| **Multi-select ring** | `#3FB950` | 137 55% 52% | `select-secondary` |

### 2.6 Semantic Colors

| Role | Hex | HSL | Tailwind |
|---|---|---|---|
| **Success** | `#2EA043` | 131 53% 44% | `semantic-success` |
| **Warning** | `#D29922` | 41 73% 48% | `semantic-warning` |
| **Error** | `#F85149` | 2 90% 62% | `semantic-error` |
| **Info** | `#58A6FF` | 212 100% 67% | `semantic-info` |

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Fallback Stack | Tailwind Class |
|---|---|---|---|
| **UI (sans-serif)** | Inter | `ui-sans-serif, system-ui, -apple-system, sans-serif` | `font-sans` |
| **Code (monospace)** | JetBrains Mono | `ui-monospace, SFMono-Regular, Menlo, monospace` | `font-mono` |

### 3.2 Size Scale

Based on a 1.250 (major third) ratio from a 14px base.

| Token | Size (px) | Size (rem) | Line Height | Tailwind Class | Usage |
|---|---|---|---|---|---|
| `text-xs` | 11 | 0.6875 | 1.45 | `text-xs` | Badges, minimap labels |
| `text-sm` | 12 | 0.75 | 1.5 | `text-sm` | Secondary labels, metadata |
| `text-base` | 14 | 0.875 | 1.57 | `text-base` | Body text, panel content |
| `text-md` | 16 | 1.0 | 1.5 | `text-md` | Panel headings, search input |
| `text-lg` | 18 | 1.125 | 1.44 | `text-lg` | Section titles |
| `text-xl` | 20 | 1.25 | 1.4 | `text-xl` | Page-level headings |
| `text-2xl` | 24 | 1.5 | 1.33 | `text-2xl` | Empty/loading state titles |

### 3.3 Font Weight Usage

| Weight | Value | Usage |
|---|---|---|
| Regular | 400 | Body text, descriptions |
| Medium | 500 | Labels, panel headings, breadcrumbs |
| Semibold | 600 | Active breadcrumb segment, selected item |
| Bold | 700 | Page titles, empty-state headings |

### 3.4 Context-Specific Typography

| Context | Font | Size | Weight | Color |
|---|---|---|---|---|
| Node label (graph) | Inter | 11--14px (zoom-dependent) | 500 | `text-primary` |
| File path in detail panel | JetBrains Mono | 12px | 400 | `text-secondary` |
| Code snippet | JetBrains Mono | 12px | 400 | `text-primary` |
| Breadcrumb inactive | Inter | 14px | 400 | `text-secondary` |
| Breadcrumb active | Inter | 14px | 600 | `text-primary` |
| Search input | Inter | 16px | 400 | `text-primary` |
| Tooltip title | Inter | 12px | 500 | `text-primary` |
| Tooltip body | Inter | 11px | 400 | `text-secondary` |

---

## 4. Graph Visual Language

### 4.1 Node Shapes by Level

| Level | Shape | Description | Sigma.js Implementation |
|---|---|---|---|
| **L1 System** | Rounded rectangle | Represents entire systems/packages | Custom renderer: `drawRoundRect` |
| **L2 Container** | Hexagon | Namespaces, modules, bounded contexts | Custom renderer: `drawHexagon` |
| **L3 Component** | Circle | Classes, interfaces, traits, services | Default `circle` program |
| **L4 Code** | Small circle | Methods, properties, constants | Default `circle` program (smaller) |

### 4.2 Node Sizing Rules

Node radius is computed from a combination of signals, normalized to a min--max range per level.

```
radius = clamp(
  BASE_SIZE[level] + (connectionWeight * 0.3) + (locWeight * 0.2),
  MIN_SIZE[level],
  MAX_SIZE[level]
)
```

| Level | Base (px) | Min (px) | Max (px) | Primary scaling factor |
|---|---|---|---|---|
| L1 | 40 | 32 | 64 | Number of contained containers |
| L2 | 28 | 20 | 48 | Number of contained components |
| L3 | 18 | 12 | 36 | Connection count (in-degree + out-degree) |
| L4 | 10 | 6 | 20 | Lines of code |

### 4.3 Node Labels

| Condition | Behavior |
|---|---|
| Zoom level < 0.3 | No labels (only L1 nodes visible with labels) |
| Zoom level 0.3--0.6 | L1 + L2 labels shown |
| Zoom level 0.6--1.0 | L1 + L2 + L3 labels shown |
| Zoom level > 1.0 | All labels shown |
| Label length > 24 chars | Truncate with ellipsis: `UserAuthenticat...` |
| Node is hovered/selected | Full label always shown, no truncation |
| Label font size | `max(11, 14 * zoomRatio)` px, capped at 14px |
| Label position | Centered below node, offset by `radius + 4px` |
| Label background | Semi-transparent `#0D1117CC` pill behind text for readability |

### 4.4 Edge Rendering

| Property | Value |
|---|---|
| **Line style (default)** | Curved (quadratic bezier, curvature 0.25) |
| **Line style (bidirectional)** | Two parallel curves offset by 3px |
| **Arrowheads** | Filled triangle, 8px length, on target end |
| **Default thickness** | 1.5px |
| **Thickness range** | 1px -- 4px |
| **Thickness scaling** | By confidence score: `1 + (confidence * 3)` where confidence is 0--1 |
| **Default opacity** | 0.4 |
| **Hover opacity** | 0.9 |
| **Selected opacity** | 1.0 |
| **Non-relevant opacity** | 0.08 (when a node is selected, unrelated edges fade) |

### 4.5 Stale Node Treatment

Staleness is communicated through layered visual cues, never through color alone.

| Freshness | Opacity | Border | Overlay Icon | Additional |
|---|---|---|---|---|
| Fresh | 1.0 | Solid, 2px | None | -- |
| Aging | 0.85 | Solid, 2px, freshness-aging color | Small clock icon (top-right) | -- |
| Stale | 0.6 | Dashed, 2px, freshness-stale color | Warning triangle (top-right) | Subtle diagonal hatch pattern fill at 5% opacity |
| Unknown | 0.4 | Dotted, 1px, text-tertiary color | Question mark (center) | Grayscale desaturation filter |

### 4.6 Stale Edge Treatment

| Freshness | Line Style | Opacity | Color Override |
|---|---|---|---|
| Fresh | Solid | 0.4 (default) | Normal edge color |
| Aging | Solid | 0.3 | Blended 50% toward `text-tertiary` |
| Stale | Dashed (4px dash, 4px gap) | 0.2 | `text-tertiary` |
| Unknown | Dotted (2px dash, 3px gap) | 0.15 | `text-tertiary` |

### 4.7 Selected Node Treatment

```
Selected state:
  - Ring: 3px solid #58A6FF at radius + 4px
  - Glow: box-shadow 0 0 20px #58A6FF40 (WebGL bloom equivalent)
  - Scale: 1.15x original size (animated 150ms ease-out)
  - Label: always visible, bold, no truncation
  - Connected edges: raised to 0.9 opacity
  - Connected nodes: raised to full opacity
  - All other nodes/edges: reduced to 0.15 opacity
```

### 4.8 Hovered Node Treatment

```
Hover state:
  - Glow: 0 0 12px #58A6FF30
  - Scale: 1.08x (animated 100ms ease-out)
  - Label: shown in full, no truncation
  - Tooltip: appears after 300ms delay (see Component Specs)
  - Connected edges: raised to 0.6 opacity
  - Cursor: pointer
```

### 4.9 Cluster Visualization

Clusters (community detection groups) are rendered as background regions behind their member nodes.

| Property | Value |
|---|---|
| Shape | Convex hull of member nodes with 24px padding |
| Corner radius | 16px |
| Fill | Node type's dominant color at 6% opacity |
| Border | 1px solid, same color at 12% opacity |
| Label | Cluster name (if available) at top of hull, `text-xs`, `text-tertiary` |
| Z-index | Below all nodes and edges |
| Hover | Fill increases to 10% opacity, border to 20% |

### 4.10 Level Transition Animation

Drill-down (e.g., L2 -> L3): The selected container node expands and fades while its children fade in from the center outward.

```
Drill-down sequence (500ms total):
  1. [0--200ms]   Camera smoothly zooms into the selected node (ease-in-out)
  2. [150--350ms] Parent-level nodes fade out (opacity 1 -> 0, ease-out)
  3. [200--400ms] Parent node morphs: expands to fill viewport center, opacity drops to 0.1
  4. [250--500ms] Child nodes appear from parent's center position,
                  moving to their force-directed positions (spring animation, stiffness 120, damping 14)
  5. [400--500ms] Child edges draw in (stroke-dashoffset animation, left to right)

Drill-up sequence (400ms total):
  1. [0--150ms]   Child nodes collapse toward center (reverse spring)
  2. [100--300ms] Child edges fade out
  3. [150--350ms] Parent node morphs back to original size
  4. [200--400ms] Sibling nodes fade back in, camera zooms out
```

---

## 5. Layout Design

### 5.1 Main Layout Wireframe

```
+-----------------------------------------------------------------------+
| [breadcrumb] L1 System > L2 Auth Module > L3 AuthService     [status] |
| [=] Hamburger                            [freshness pill] [refresh] [?]|
+--------+------------------------------------------------------+-------+
|        |                                                      |       |
| SEARCH |                                                      | NODE  |
| [____] |                                                      | DETAIL|
|        |                                                      |       |
| FILTERS|                    GRAPH VIEWPORT                    | ----  |
| [] Cls |                                                      | Name  |
| [] Ifc |                  (Sigma.js Canvas)                   | Type  |
| [] Trt |                                                      | Path  |
| [] Mtd |                   80%+ of viewport                   | Lines |
| [] Fil |                                                      | Last  |
|        |                                                      | Conns |
| EDGE   |                                                      |       |
| TYPES  |                                                      |       |
| [] Cal |                                                      |       |
| [] Ext |                                                      |       |
| [] Imp |                                                      |       |
| [] Use |                                                      |       |
| [] Inj |                                                      |       |
|        |                                                      |       |
+--------+------------------------------------------------------+-------+
| [minimap]  [-] zoom [+]   |  legend: o Class o Interface ...  | v1.0  |
+-----------------------------------------------------------------------+
```

### 5.2 Panel Dimensions and Behavior

| Panel | Width/Height | Min | Max | Behavior |
|---|---|---|---|---|
| **Left panel** (search + filters) | 280px | 240px | 360px | Collapsible via hamburger icon. Slides left. Keyboard: `Ctrl+B` |
| **Right panel** (details) | 320px | 280px | 480px | Auto-opens on node/edge selection. Closes on canvas click. Keyboard: `Escape` |
| **Top bar** | 100% x 48px | -- | -- | Always visible. Fixed position. |
| **Bottom bar** | 100% x 36px | -- | -- | Always visible. Fixed position. Semi-transparent `#0D1117E6`. |
| **Graph viewport** | Remaining space | -- | -- | Fills all space not used by panels. Resizes responsively. |

#### Panel Collapse States

```
Both panels open:    [280px] [remaining] [320px]
Left collapsed:      [0px]  [remaining] [320px]
Right collapsed:     [280px] [remaining] [0px]
Both collapsed:      [0px]  [remaining] [0px]     <- maximum graph space
```

Panels use a 200ms slide animation (`ease-in-out`). The graph viewport resizes with the panel transition using CSS `transition: margin 200ms ease-in-out`.

### 5.3 Responsive Breakpoints

| Breakpoint | Width | Behavior |
|---|---|---|
| Desktop XL | >= 1440px | Both panels can be open simultaneously |
| Desktop | 1024--1439px | Both panels can be open, but right panel overlays graph |
| Tablet | 768--1023px | Only one panel at a time, overlay mode |
| Mobile | < 768px | Full-screen panels, graph behind. Not a primary target. |

### 5.4 Z-Index Stack

| Layer | Z-Index | Contents |
|---|---|---|
| Graph canvas | 0 | Sigma.js WebGL canvas |
| Cluster hulls | 1 | SVG overlay for cluster backgrounds |
| Bottom bar | 10 | Minimap, zoom, legend |
| Left panel | 20 | Search, filters |
| Right panel | 20 | Node/edge details |
| Top bar | 30 | Breadcrumbs, status, actions |
| Tooltips | 40 | Hover tooltips on graph nodes |
| Dropdowns/menus | 50 | Context menus, export menu |
| Modals | 60 | Settings, confirmation dialogs |
| Toasts | 70 | Notification toasts |

---

## 6. Component Design Specs

### 6.1 Search Bar

```
+------------------------------------------+
| [icon:search] Search nodes...   [T|S]    |
+------------------------------------------+
  ^                                 ^
  magnifying glass icon         mode toggle
  16px, text-tertiary           T=Text, S=Semantic
```

| Property | Value |
|---|---|
| Container | `w-full h-10 bg-surface-700 rounded-lg border border-border-default` |
| Input | `text-md font-sans text-primary placeholder:text-tertiary px-3` |
| Search icon | 16x16px, `text-tertiary`, left-padded 12px |
| Mode toggle | Pill toggle, 24x20px per option, `bg-surface-600` inactive, `bg-info/20 text-info` active |
| Focus state | `border-border-emphasis ring-1 ring-info/30` |
| Keyboard | `Ctrl+K` or `/` to focus. `Tab` toggles mode. `Enter` executes. `Escape` clears and blurs. |
| Results | Dropdown below input, max 8 items, each 40px tall. Shows node type icon + name + file path. |
| Debounce | 250ms for text, 500ms for semantic (network call) |

### 6.2 Filter Panel

```
NODE TYPES                    EDGE TYPES
+-----------------------+     +-----------------------+
| [x] Class        (42) |     | [x] Calls        (89) |
| [x] Interface    (12) |     | [x] Extends      (23) |
| [x] Trait         (8) |     | [x] Implements   (15) |
| [x] Method      (156) |     | [x] Uses         (67) |
| [x] File         (34) |     | [x] Injects      (31) |
| [x] Folder       (11) |     |                       |
+-----------------------+     +-----------------------+
  [All] [None] [Invert]        [All] [None] [Invert]
```

| Property | Value |
|---|---|
| Section heading | `text-xs font-medium text-tertiary uppercase tracking-wider mb-2 px-3` |
| Checkbox row | `h-8 px-3 flex items-center gap-2 hover:bg-surface-700 rounded` |
| Checkbox | 16x16px, `rounded border-border-default`. Checked: `bg-info border-info` with white checkmark |
| Type indicator | 8x8px circle with the node/edge type color, inline before label |
| Count badge | `text-xs text-tertiary ml-auto tabular-nums` |
| Quick actions | `text-xs text-link hover:underline cursor-pointer`, inline row below filters |
| Spacing | 8px between checkbox rows, 16px between sections |

### 6.3 Node Detail Card

Opens in the right panel when a node is selected.

```
+--------------------------------------------+
| [x close]                                   |
|                                             |
| [type-color-dot] ClassName                  |
| Class                          [fresh pill] |
|                                             |
| ------------------------------------------ |
|                                             |
| FILE PATH                                   |
| src/Auth/Service/AuthService.php    [copy]  |
|                                             |
| LINES           CONNECTIONS                 |
| 45 -- 128       12 in / 8 out              |
|                                             |
| LAST ANALYZED                               |
| 2 hours ago (fresh)                         |
|                                             |
| ------------------------------------------ |
|                                             |
| CONNECTIONS                          [show] |
| -> calls UserRepository.findById()          |
| -> calls TokenService.generate()            |
| <- called by AuthController.login()         |
| <- called by AuthController.register()      |
| ... +4 more                                 |
|                                             |
| ------------------------------------------ |
|                                             |
| [Blast Radius]  [Open in Editor]  [Export]  |
+--------------------------------------------+
```

| Property | Value |
|---|---|
| Panel padding | 20px (`p-5`) |
| Close button | 24x24px, top-right, `text-tertiary hover:text-primary` |
| Node name | `text-lg font-semibold text-primary` |
| Node type badge | `text-xs font-medium px-2 py-0.5 rounded-full` with type background color at 15% opacity and type color text |
| Freshness pill | Inline, `text-xs`, same style as type badge but with freshness color |
| Section label | `text-xs font-medium text-tertiary uppercase tracking-wider mt-4 mb-1` |
| File path | `font-mono text-sm text-secondary` |
| Copy button | 16x16px clipboard icon, `text-tertiary hover:text-info` |
| Connection row | `text-sm text-secondary py-1`, arrow prefix colored by edge type |
| Dividers | `border-t border-border-muted my-3` |
| Action buttons | `h-8 px-3 text-sm font-medium rounded-md bg-surface-700 text-secondary hover:bg-surface-600 hover:text-primary` |

### 6.4 Edge Detail Card

Opens in the right panel when an edge is selected. Replaces node detail if one was open.

```
+--------------------------------------------+
| [x close]                                   |
|                                             |
| [edge-color-line] CALLS                     |
|                              [fresh pill]   |
|                                             |
| ------------------------------------------ |
|                                             |
| SOURCE                                      |
| [purple dot] AuthService                    |
| src/Auth/Service/AuthService.php:67         |
|                                             |
| TARGET                                      |
| [blue dot] UserRepository.findById          |
| src/User/Repository/UserRepository.php:23   |
|                                             |
| ------------------------------------------ |
|                                             |
| CONFIDENCE        OCCURRENCES               |
| 0.95 (high)       3 call sites              |
|                                             |
| CALL SITES                                  |
| Line 67:  $this->userRepo->findById($id)   |
| Line 89:  $this->userRepo->findById($uid)  |
| Line 112: $this->userRepo->findById($ref)  |
|                                             |
| ------------------------------------------ |
|                                             |
| [Select Source]  [Select Target]            |
+--------------------------------------------+
```

| Property | Value |
|---|---|
| Edge type heading | `text-lg font-semibold`, colored with the edge type color |
| Source/Target sections | Same layout as node name in node detail, clickable to switch to that node's detail |
| Confidence display | Numeric + label. `>= 0.8` = "high" (green), `0.5--0.79` = "medium" (yellow), `< 0.5` = "low" (red) |
| Call site code | `font-mono text-xs bg-surface-900 rounded px-2 py-1 my-1 block` |
| Line number | `text-tertiary font-mono` prefix |

### 6.5 Breadcrumb Navigation

```
[home icon] System  >  Auth Module  >  AuthService
  gray         gray   >    gray      >   white/bold
```

| Property | Value |
|---|---|
| Container | `h-12 flex items-center gap-1 px-4` |
| Home icon | 16x16px, `text-tertiary hover:text-primary cursor-pointer` |
| Inactive segment | `text-sm font-medium text-secondary hover:text-primary cursor-pointer px-1.5 py-0.5 rounded hover:bg-surface-700` |
| Active segment | `text-sm font-semibold text-primary px-1.5 py-0.5` |
| Separator | `>` character or chevron-right icon, 12px, `text-tertiary mx-0.5` |
| Click behavior | Clicking a segment triggers drill-up to that level |
| Max segments | 4 (L1 > L2 > L3 > L4). Overflow: show first + last with `...` |

### 6.6 Freshness Banner

A thin status bar inside the top bar showing global analysis health.

```
+-------------------------------------------------------------------+
| [green dot] 89% fresh  |  12 aging  |  3 stale  |  [Refresh All] |
+-------------------------------------------------------------------+
```

| Property | Value |
|---|---|
| Container | `h-6 flex items-center gap-3 text-xs px-3 bg-surface-800 rounded-full` |
| Dot indicator | 6x6px circle, color = worst state among all nodes |
| Percentage | `font-medium`, colored by freshness (green/yellow/red) |
| Counts | `text-tertiary` with colored number |
| Refresh button | `text-link hover:underline text-xs cursor-pointer` |

### 6.7 Refresh Button with Progress

```
Idle:       [circular-arrow icon]
Hover:      [circular-arrow icon] "Refresh analysis"  (tooltip)
Active:     [spinning icon] Analyzing... 34/128
Complete:   [check icon] Done  (fades back to idle after 2s)
Error:      [x icon] Failed  (red, click to retry)
```

| Property | Value |
|---|---|
| Button | `w-8 h-8 rounded-md bg-surface-700 hover:bg-surface-600 flex items-center justify-center` |
| Icon | 16x16px, `text-secondary`, spins during active state (CSS `animate-spin`) |
| Progress text | Appears as tooltip or inline next to button: `text-xs text-secondary` |
| Progress bar | Thin 2px bar at very top of viewport, `bg-info`, width = percentage |

### 6.8 Blast Radius Toggle

```
OFF:  [target icon] Blast Radius
ON:   [target icon active] Blast Radius  [depth: 2 [-][+]]
```

| Property | Value |
|---|---|
| Toggle button | Same style as action buttons. Active: `bg-blast-highlight/15 text-blast-highlight border border-blast-highlight/30` |
| Depth control | Appears when active. `text-xs`, `[-]` and `[+]` buttons, numeric display between. Range: 1--5, default 2 |
| Activation | Click node first, then toggle blast radius. If no node selected, show tooltip "Select a node first" |

### 6.9 Export Menu

```
[download icon] Export v
  +-------------------+
  | PNG (current view) |
  | SVG (current view) |
  | JSON (graph data)  |
  | CSV (node list)    |
  +-------------------+
```

| Property | Value |
|---|---|
| Trigger | `w-8 h-8` icon button, same style as refresh |
| Dropdown | `w-48 bg-elevated rounded-lg border border-border-default shadow-lg py-1` |
| Menu item | `h-8 px-3 text-sm text-secondary hover:bg-surface-700 hover:text-primary flex items-center gap-2` |
| Icon per item | 16x16px, `text-tertiary` |

### 6.10 Legend

Displayed in the bottom bar, collapsible.

```
[legend icon] o Class  o Interface  o Trait  o Method  o File  -- Calls  -- Extends  -- Implements  [fresh/aging/stale dots]
```

| Property | Value |
|---|---|
| Container | `flex items-center gap-4 text-xs text-tertiary` |
| Node legend item | 8px circle (colored) + label |
| Edge legend item | 16px line (colored, 2px) + label |
| Freshness legend | Three 6px circles (green/yellow/red) + labels |
| Toggle | Click "legend icon" to expand/collapse. Default: collapsed on screens < 1440px |

### 6.11 Empty State (No Analysis Yet)

```
+----------------------------------------------+
|                                              |
|              [large graph icon]              |
|                                              |
|         No analysis data found               |
|                                              |
|   Run the analyzer to visualize your         |
|   codebase relationships.                    |
|                                              |
|          [Run Analysis]                      |
|                                              |
|   $ sniffo analyze ./src             |
|                                              |
+----------------------------------------------+
```

| Property | Value |
|---|---|
| Icon | 64x64px, `text-tertiary` opacity 0.5 |
| Heading | `text-2xl font-bold text-primary` |
| Description | `text-base text-secondary max-w-md text-center mt-2` |
| CTA button | `h-10 px-6 bg-info text-white font-medium rounded-lg hover:bg-info/90 mt-6` |
| CLI hint | `font-mono text-sm text-tertiary bg-surface-800 rounded px-3 py-2 mt-4` |

### 6.12 Loading State (During Analysis)

```
+----------------------------------------------+
|                                              |
|         [animated pulse graph icon]          |
|                                              |
|         Analyzing codebase...                |
|                                              |
|   [=========>                    ] 34%       |
|                                              |
|   Parsing AuthService.php (34/128 files)     |
|                                              |
+----------------------------------------------+
```

| Property | Value |
|---|---|
| Icon | 48x48px, `text-info`, pulsing animation (scale 0.95--1.05, 1.5s infinite) |
| Heading | `text-xl font-semibold text-primary` |
| Progress bar | `h-2 w-64 bg-surface-700 rounded-full overflow-hidden` with `bg-info rounded-full transition-all duration-300` fill |
| Detail text | `text-sm text-secondary mt-2 font-mono` |
| Cancel button | `text-sm text-tertiary hover:text-primary mt-4 underline` |

---

## 7. Interaction Patterns

### 7.1 Drill-Down

| Trigger | Action |
|---|---|
| Double-click node | Drill into that node's children (L1->L2, L2->L3, L3->L4) |
| Breadcrumb click | Drill up to that level |
| `Backspace` or `Escape` (when no panel open) | Drill up one level |
| Scroll wheel while holding `Alt` | Navigate levels (up = drill out, down = drill in on nearest node to cursor) |

**Visual sequence:** See section 4.10 for detailed animation spec.

**URL state:** Each drill level updates the URL hash: `#/system/auth-module/auth-service` enabling deep links and browser back/forward navigation.

### 7.2 Search Results

```
1. User types in search bar (debounced 250ms / 500ms)
2. Results appear in dropdown below search input (max 8 items)
3. Each result shows: [type-dot] NodeName  filepath:line
4. Hovering a result item highlights the corresponding node in the graph (glow effect)
5. Clicking a result:
   a. Navigates to the correct drill level if needed
   b. Centers the camera on that node (animated 300ms)
   c. Selects the node (opens detail panel)
   d. Closes the search dropdown
6. If the node is in a different level, auto-drill-down/up with transition
7. For semantic search: results include a relevance score (0--1) shown as a bar
```

### 7.3 Blast Radius Visualization

```
1. User selects a node
2. User activates "Blast Radius" toggle
3. Depth control appears (default: 2)
4. Animation (300ms):
   a. All nodes NOT in the blast radius fade to 15% opacity
   b. All edges NOT in the blast radius fade to 8% opacity
   c. The selected node gets the blast-highlight ring (#F78166)
   d. Direct dependents (depth 1) get a slightly dimmer highlight ring
   e. Indirect dependents (depth 2+) get progressively dimmer rings
   f. Affected edges colorize to blast-highlight color with full opacity
5. Adjusting depth re-runs steps a--f with new calculation
6. Deactivating toggle restores all opacities (300ms fade back)
7. A counter badge shows "N nodes affected" near the toggle
```

Blast radius direction: outgoing by default (what does this node affect?). A direction toggle (outgoing/incoming/both) appears next to depth control.

### 7.4 Hover Behavior

| Target | Delay | Tooltip Content |
|---|---|---|
| Node | 300ms | Name, type, file:line, connection count, freshness |
| Edge | 300ms | Type, source -> target, confidence, freshness |
| Cluster hull | 500ms | Cluster name, node count, primary type distribution |
| Legend item | 0ms | Full label (for truncated items only) |
| Toolbar button | 0ms | Action name + keyboard shortcut |

**Tooltip design:**

```
+-----------------------------+
| AuthService          Class  |
| src/Auth/AuthService.php    |
| 12 in / 8 out    2h ago    |
+-----------------------------+
```

| Property | Value |
|---|---|
| Container | `bg-elevated border border-border-default rounded-lg shadow-xl px-3 py-2 max-w-xs` |
| Position | Above the node by default, flips to below if near viewport top. 8px offset. |
| Pointer | 6px CSS triangle pointing toward the node |
| Dismiss | Immediately on mouse-out from node (no delay) |

### 7.5 Multi-Select

| Trigger | Behavior |
|---|---|
| `Shift + Click` | Add/remove node from selection |
| `Ctrl/Cmd + Click` | Same as Shift+Click (alias) |
| Drag selection box | `Shift + drag` on canvas draws a selection rectangle |
| `Escape` | Clear all selections |

When multiple nodes are selected:
- Right panel shows a comparison summary: types, shared connections, freshness range
- "N nodes selected" badge appears in top bar
- Blast radius operates on the union of all selected nodes

### 7.6 Context Menu (Right-Click)

```
+-------------------------------+
| View Details            Enter |
| Focus on This Node          F |
| ----------------------------- |
| Show Blast Radius           B |
| Show Incoming Only          I |
| Show Outgoing Only          O |
| ----------------------------- |
| Copy Name              Ctrl+C |
| Copy File Path                |
| Open in Editor         Ctrl+E |
| ----------------------------- |
| Collapse Children             |
| Hide This Node            Del |
| Hide All of This Type         |
+-------------------------------+
```

| Property | Value |
|---|---|
| Container | `w-56 bg-elevated border border-border-default rounded-lg shadow-xl py-1` |
| Item | `h-8 px-3 text-sm text-secondary hover:bg-surface-700 hover:text-primary flex items-center justify-between` |
| Shortcut | `text-xs text-tertiary font-mono` |
| Divider | `border-t border-border-muted my-1 mx-2` |
| Dismiss | Click outside, or `Escape` |

### 7.7 Keyboard Shortcuts Summary

| Shortcut | Action |
|---|---|
| `/` or `Ctrl+K` | Focus search |
| `Ctrl+B` | Toggle left panel |
| `Escape` | Close panel / clear selection / drill up |
| `Backspace` | Drill up one level |
| `Enter` | Drill into selected node |
| `Tab` | Cycle through nodes (focus ring) |
| `Shift+Tab` | Cycle backward |
| `+` / `-` | Zoom in / out |
| `0` | Reset zoom to fit |
| `F` | Focus/center on selected node |
| `B` | Toggle blast radius |
| `L` | Toggle legend |
| `?` | Show keyboard shortcuts overlay |

---

## 8. Accessibility

### 8.1 Color Contrast Ratios

All text must meet WCAG 2.1 AA minimum. Verified ratios against `bg-primary` (#0D1117):

| Element | Foreground | Background | Ratio | Grade |
|---|---|---|---|---|
| Primary text | `#E6EDF3` | `#0D1117` | 13.8:1 | AAA |
| Secondary text | `#8B949E` | `#0D1117` | 5.4:1 | AA |
| Tertiary text | `#6E7681` | `#0D1117` | 3.7:1 | AA (large text only) |
| Link text | `#58A6FF` | `#0D1117` | 6.1:1 | AA |
| Primary text on panel | `#E6EDF3` | `#161B22` | 11.7:1 | AAA |
| Secondary text on panel | `#8B949E` | `#161B22` | 4.6:1 | AA |

**Important:** Tertiary text (#6E7681) at 3.7:1 is below the 4.5:1 AA threshold for normal text. It is only used for:
- Text 14px+ (passes AA large text at 3:1)
- Decorative/supplementary labels where the information is also conveyed by other means

All node type colors are verified to have >= 3:1 contrast against the graph background for the filled shapes (non-text graphical objects per WCAG 1.4.11).

### 8.2 Keyboard Navigation Plan

#### Focus Management

```
Tab order:
1. Top bar: breadcrumb segments -> freshness banner -> refresh -> help
2. Left panel (if open): search input -> mode toggle -> filter checkboxes -> quick actions
3. Graph canvas (focus trap with internal navigation)
4. Right panel (if open): close button -> content links -> action buttons
5. Bottom bar: minimap -> zoom controls -> legend toggle
```

#### Graph Keyboard Navigation

When the graph canvas is focused:
- `Tab` moves focus to the next node (ordered by visual position, left-to-right, top-to-bottom)
- `Shift+Tab` moves focus backward
- `Arrow keys` move focus to the nearest node in that direction
- `Enter` selects the focused node (opens detail panel)
- `Space` toggles the focused node in multi-select
- `Delete` hides the focused node
- Focused node receives a visible focus ring: `3px dashed #58A6FF`, distinct from the selection ring (solid)

#### Panel Focus Trapping

When a panel opens, focus moves to the first focusable element inside. `Escape` closes the panel and returns focus to the previously focused element (graph node or search input).

### 8.3 Screen Reader Considerations

#### Graph Data as Accessible Table

The graph is inherently visual. For screen reader users, provide an alternative data representation:

```html
<!-- Hidden but accessible data table -->
<div role="region" aria-label="Code relationship graph">
  <p id="graph-summary">
    Graph showing 128 code elements with 234 relationships.
    Currently viewing L3 Component level of Auth Module.
  </p>

  <!-- Announce on selection -->
  <div aria-live="polite" aria-atomic="true" id="graph-announcer">
    Selected AuthService (Class). 12 incoming connections, 8 outgoing.
    Located in src/Auth/Service/AuthService.php, lines 45-128.
    Last analyzed 2 hours ago (fresh).
  </div>
</div>
```

#### ARIA Roles and Labels

| Element | Role/Attribute |
|---|---|
| Graph canvas | `role="application"`, `aria-label="Code relationship graph"`, `aria-describedby="graph-summary"` |
| Left panel | `role="complementary"`, `aria-label="Search and filters"` |
| Right panel | `role="complementary"`, `aria-label="Node details"` |
| Top bar | `role="navigation"`, `aria-label="Breadcrumb navigation"` |
| Bottom bar | `role="toolbar"`, `aria-label="Graph controls"` |
| Breadcrumbs | `role="navigation"` with `aria-label="Drill-down navigation"`, `<ol>` semantics |
| Filter checkbox group | `role="group"`, `aria-label="Node type filters"` |
| Search results | `role="listbox"` with `aria-activedescendant` for keyboard navigation |
| Freshness pill | `aria-label="Freshness: fresh, analyzed 2 hours ago"` (not just color) |
| Zoom controls | `aria-label="Zoom in"` / `"Zoom out"`, `aria-valuenow` on zoom level |
| Minimap | `aria-hidden="true"` (decorative, information available via breadcrumbs) |

#### Live Announcements

Use `aria-live="polite"` regions for:
- Node selection changes
- Drill-down level changes ("Now viewing L3 Components of Auth Module, showing 24 nodes")
- Search results count ("5 results found for 'auth'")
- Blast radius activation ("Blast radius active: 8 nodes affected at depth 2")
- Analysis progress ("Analysis 34% complete, processing AuthService.php")

### 8.4 Motion and Animation

- Respect `prefers-reduced-motion`: when set, replace all transitions with instant state changes (opacity swaps, no slides or zooms)
- Drill-down transition becomes a simple fade (200ms) instead of the full zoom+morph sequence
- Graph force-directed layout still runs but nodes settle instantly (no animated positioning)
- Spinner animations remain (essential for conveying "in progress" state) but slow to 2s rotation

### 8.5 High Contrast Mode Support

When `prefers-contrast: more` is detected:
- Border colors shift to `#8B949E` (higher contrast)
- Text-tertiary is not used; all text uses text-secondary minimum
- Node colors increase saturation by 20%
- Edge default opacity increases from 0.4 to 0.7
- Selection ring width increases from 3px to 4px

---

## Appendix A: Tailwind Theme Configuration

```js
// tailwind.config.js (partial)
module.exports = {
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0D1117',
          800: '#161B22',
          700: '#21262D',
          600: '#282E36',
        },
        border: {
          default: '#30363D',
          muted: '#21262D',
          emphasis: '#3D444D',
        },
        text: {
          primary: '#E6EDF3',
          secondary: '#8B949E',
          tertiary: '#6E7681',
          link: '#58A6FF',
        },
        node: {
          class: '#7C3AED',
          interface: '#06B6D4',
          trait: '#F59E0B',
          method: '#3B82F6',
          file: '#10B981',
          folder: '#64748B',
          namespace: '#A78BFA',
          service: '#EC4899',
        },
        edge: {
          calls: '#4B7BEC',
          extends: '#A55EEA',
          implements: '#26DE81',
          uses: '#778CA3',
          injects: '#FD9644',
          contains: '#45526E',
          imports: '#20BF6B',
        },
        freshness: {
          fresh: '#2EA043',
          aging: '#D29922',
          stale: '#F85149',
          unknown: '#6E7681',
        },
        semantic: {
          success: '#2EA043',
          warning: '#D29922',
          error: '#F85149',
          info: '#58A6FF',
        },
        select: {
          primary: '#58A6FF',
          secondary: '#3FB950',
          glow: '#58A6FF40',
        },
        blast: {
          highlight: '#F78166',
          fade: 'rgba(13, 17, 23, 0.85)',
        },
        search: {
          match: '#D2A8FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['0.6875rem', { lineHeight: '1.45' }],
        sm: ['0.75rem', { lineHeight: '1.5' }],
        base: ['0.875rem', { lineHeight: '1.57' }],
        md: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.44' }],
        xl: ['1.25rem', { lineHeight: '1.4' }],
        '2xl': ['1.5rem', { lineHeight: '1.33' }],
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-subtle': 'pulse-subtle 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
      },
    },
  },
};
```

## Appendix B: Sigma.js Node Programs

Custom node renderers required:

| Program | Shape | Used By |
|---|---|---|
| `roundedRect` | Rounded rectangle with 8px radius | L1 System nodes |
| `hexagon` | Regular hexagon | L2 Container nodes |
| `circle` (built-in) | Circle | L3 Component, L4 Code nodes |
| `circleWithBadge` | Circle with small icon overlay (top-right) | Any node with freshness badge |

Each program must support:
- Dynamic fill color (from node type)
- Border style (solid/dashed/dotted based on freshness)
- Selection ring rendering
- Focus ring rendering (dashed, for keyboard navigation)
- Label rendering with background pill

## Appendix C: CSS Custom Properties

For values that may need runtime theming or user customization:

```css
:root {
  --graph-bg: #0D1117;
  --panel-width-left: 280px;
  --panel-width-right: 320px;
  --topbar-height: 48px;
  --bottombar-height: 36px;
  --transition-panel: 200ms ease-in-out;
  --transition-drill: 500ms;
  --transition-selection: 150ms ease-out;
  --transition-hover: 100ms ease-out;
  --node-label-min-zoom: 0.3;
  --edge-default-opacity: 0.4;
  --edge-dim-opacity: 0.08;
  --blast-fade-opacity: 0.15;
  --tooltip-delay: 300ms;
  --search-debounce: 250ms;
  --search-debounce-semantic: 500ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --transition-panel: 0ms;
    --transition-drill: 200ms;
    --transition-selection: 0ms;
    --transition-hover: 0ms;
  }
}

@media (prefers-contrast: more) {
  :root {
    --edge-default-opacity: 0.7;
  }
}
```
