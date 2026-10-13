# Product Requirements Specification (PRD)

> M00 note (10 October 2026): This document describes historical or provisional
> behavior. Conflicting business rules and completion claims are superseded by
> [RULES](../docs/plans/RULES.md), [DECISIONS](../docs/plans/DECISIONS.md) and
> the [M00 conflict ledger](../docs/plans/M00-evidence.md#older-documentation-conflicts).
> Retain unrelated architecture notes. Named missing script handlers do not
> establish implemented parity. M01 has not started.

## Project Overview
**App Name:** TaskPulse - Advanced Multi-Metric Performance Tracker  
**Goal:** A high-precision, cross-platform web application (Desktop, Tablet, Mobile) built on the multi-dimensional tracking sheet methodology. It converts complex task scales, freshness statuses, priority loading, and productivity medians into an intuitive digital workspace.

## Key Design & Aesthetic Philosophy
- **Exact Sheet Match:** Mirrors the color coding, structural density, and visual balance of the original task sheet.
- **High-Focus Interface:** Emphasizes clean gridlines (`border-slate-200`), clear visual hierarchy, soft-tint status badges, and dense data scanning.
- **Multi-Device Optimization:**
  - **Mobile (< 768px):** Bottom navigation, FAB for quick-logging hours/progress, swipeable cards, full-screen drawer forms.
  - **Tablet (768px - 1024px):** Collapsible sidebar, 2-column grid, horizontal scroll tables with sticky columns.
  - **Desktop (> 1024px):** Dense multi-column data grid, side-by-side analytics widgets, split-pane detailed task views.

## User Roles & Personas
- **Executive / Manager (`managing_director`):** Full administrative visibility. Monitors star performer metrics, team productivity differentials, loading percentages against team medians, and milestone goals.
- **Team Lead (`project_engineer`):** Manages project-specific task allocations, site/field visits, estimates, and reviews team outputs.
- **Data & Ops Specialist (`data_manager`):** Handles operational, administrative, client-centric, and marketing task execution with daily log updates.
- **Contributor (`team_member`):** Focuses on personal task execution and daily time/progress logging.

## Essential Application Modules

### 1. Task Tracker & Operations Grid
- High-density spreadsheet-style table view with sorting, filtering, and column visibility options.
- Support for task tags (e.g., `Sep26_T5`), custom scaled weights, percentage progress, assigned reviewers, and deadline compliance checks.
- Visual freshness indicators (`Fresh`, `Stale`, `Rotten`) and priority markers (`Focus`, `High`, `Medium`, `Low`, `No`).

### 2. Daily Effort & Progress Logger
- Fast entry interface to log date, hours worked, incremental progress delta (%), update notes, and links to raw assets (documents, drawings, boards).
- Auto-recalculation of total task progress, remaining scale, and individual productivity rate upon submission.

### 3. Team Performance & Medians Engine
- Dashboard presenting **Star Performer of the Month**.
- Calculations comparing each member against the **Team Median** across:
  - Productivity Differentials (Progress / Hour vs Team Median)
  - Criticality Scores & Median Deviations
  - Priority Loading Allocation Percentage
  - Freshness Scores & Daily Facts / Suggestions Logs

### 4. Workspace Goals & Milestones
- Dedicated workspace tab to showcase Organizational Vision, Mission Statements, Core Values, and Monthly Milestone targets.