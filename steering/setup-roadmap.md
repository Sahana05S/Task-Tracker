# Phased Build & Execution Roadmap

Follow this exact phase order when instructing Kiro to build out features:

## Phase 1: Database & Foundation
- [ ] Initialize Next.js App Router project with Tailwind CSS and Shadcn UI.
- [ ] Create `@/types/tracker.ts` containing all TypeScript interfaces matching `database-schema.md`.
- [ ] Execute Supabase SQL migrations for custom ENUMs, tables, generated columns, and RLS policies.
- [ ] Configure Supabase client helpers (`@/lib/supabase/client.ts` and `@/lib/supabase/server.ts`).

## Phase 2: Auth & Workspace Layout
- [ ] Build user Login/Signup views using Supabase Auth.
- [ ] Construct the responsive layout shell:
  - **Desktop:** Permanent left sidebar navigation + workspace header.
  - **Mobile:** Sticky bottom navigation bar with prominent "Log Hours (+)" FAB.
- [ ] Implement middleware role guards (`managing_director`, `project_engineer`, `data_manager`, `team_member`).

## Phase 3: Task Management Module
- [ ] Build the **Desktop Task Grid**: Dense multi-column table with sortable headers, sticky task tag column, and inline status/progress dropdowns.
- [ ] Build the **Mobile Task Cards**: Card-based stack with progress bar and drawer details view.
- [ ] Implement Task Filter Bar (Filter by Assignee, Category, Priority, Status, and Freshness).
- [ ] Create Task CRUD dialogs/drawers.

## Phase 4: Daily Effort & Progress Logger
- [ ] Build the "Quick Log Hours" slide-over drawer / modal (`daily_task_logs`).
- [ ] Implement automatic recalculation of overall task progress, remaining scale, and individual task productivity upon log submission.
- [ ] Build the user's personal Daily Log History calendar/timeline.

## Phase 5: Analytics & Team Medians Engine
- [ ] Implement server-side calculation functions for Team Productivity Medians and Loading Differentials.
- [ ] Build Dashboard summary cards: **Star Performer of the Month**, Team Average Productivity, Total Scaled Progress.
- [ ] Integrate Recharts visualization widgets for Productivity Differentials and Priority Loading distributions.
- [ ] Build Organizational Vision, Mission, Values, and Monthly Milestones tab.