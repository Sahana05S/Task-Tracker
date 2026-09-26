# Responsive UI & Design System Specification

## Visual Design Philosophy & Aesthetic Guidelines
- **Sheet-Faithful Aesthetic:** Uses subtle structural gridlines, clean borders, high data density, and soft-tinted status badges mirroring professional Google Sheets.
- **High-Focus Workspace:** Eliminates visual noise. Information is visually grouped using crisp micro-borders (`border-slate-200`) and structured data tables.
- **Typography:** Crisp sans-serif (`Inter` or system-ui) with clear weight hierarchy (bold metric values, medium table headers, tabular numbers for hours/progress).

---

## Google Sheet Color Palette & Theme System

### 1. Base Structure & Grid
- **Page Background:** Off-White / Soft Gray (`bg-slate-50`)
- **Card / Cell Background:** Pure White (`bg-white`)
- **Grid Lines & Micro-Borders:** Subtle Slate (`border-slate-200`)
- **Primary Text:** Dark Charcoal (`text-slate-900`)
- **Secondary Text / Subtitles:** Slate Gray (`text-slate-500`)

### 2. Task Status Badges (Soft Tints)
- **Done:** Soft Emerald
  - Background: `bg-emerald-50` | Text: `text-emerald-700` | Border: `border-emerald-200`
- **In Progress:** Soft Sky Blue
  - Background: `bg-sky-50` | Text: `text-sky-700` | Border: `border-sky-200`
- **Not Started:** Neutral Slate
  - Background: `bg-slate-100` | Text: `text-slate-600` | Border: `border-slate-200`
- **Discarded:** Soft Muted Rose
  - Background: `bg-rose-50/50` | Text: `text-rose-600` | Border: `border-rose-200`

### 3. Task Priority Badges
- **Focus:** Vibrant Coral Red (`bg-rose-100 text-rose-800 border-rose-300 font-semibold`)
- **High:** Soft Coral Pink (`bg-rose-50 text-rose-700 border-rose-200`)
- **Medium:** Soft Amber / Yellow (`bg-amber-50 text-amber-700 border-amber-200`)
- **Low:** Light Slate (`bg-slate-100 text-slate-700 border-slate-200`)
- **No:** Transparent / Dimmed Gray (`text-slate-400`)

### 4. Freshness Indicators
- **Fresh:** Small Emerald Dot (`bg-emerald-500`) + Text (`text-emerald-700`)
- **Stale:** Small Amber Dot (`bg-amber-500`) + Text (`text-amber-700`)
- **Rotten:** Small Rose Dot (`bg-rose-500`) + Text (`text-rose-700`)

---

## Responsive Viewport Layout Specifications

### 1. Mobile Viewport (< 768px)
- **Primary Focus:** Fast on-the-go effort logging and quick task status toggles.
- **Navigation:** Sticky bottom navigation bar with 4 key destinations:
  - `Dashboard` | `Tasks` | `Log Hours (+)` (Centered Floating Action Button) | `Milestones`
- **Task View:** Rendered as stacked, high-density mobile cards:
  - **Header:** Task Tag (`Sep26_T5`), Category Badge, Freshness Indicator.
  - **Body:** Task Title, Assignee avatar, Progress bar with % badge.
  - **Footer:** Status selector dropdown, "Quick Log" button.
- **Forms & Log Modal:** Slides up as a full-screen drawer bottom sheet.

### 2. Tablet Viewport (768px - 1024px)
- **Primary Focus:** Site inspections, review sessions, and task assignments.
- **Navigation:** Collapsible slim left sidebar (Icon-only mode with tooltips).
- **Dashboard Layout:** 2-Column responsive grid:
  - **Column 1:** Star Performer card & Team Median Summary.
  - **Column 2:** Recent Task Logs & Progress Timeline.
- **Tables:** Data grid wrapped in horizontal touch-scrolling container (`overflow-x-auto`) with frozen/sticky first column (`Task Tag`).

### 3. Desktop Viewport (> 1024px)
- **Primary Focus:** In-depth management, multi-task tracking, and analytics analysis.
- **Navigation:** Permanent left navigation sidebar showing active workspace, user profile, and role indicator.
- **Data Grid (Main Task View):** Multi-column dense spreadsheet layout:
  - Sticky table header row (`bg-slate-100 text-slate-700 font-semibold text-xs uppercase`).
  - Sortable headers, inline quick-edit cells (progress slider, status picker).
  - Hover highlights on table rows (`hover:bg-slate-50`).
- **Analytics Layout:** Side-by-side grid comparing individual metrics against team medians using Recharts (Productivity differentials, loading distributions, criticality scores).