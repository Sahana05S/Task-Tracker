# Technology Stack & Coding Standards

## Core Framework & Architecture
- **Framework:** Next.js (App Router, React 19 / Server Components, TypeScript).
- **Styling:** Tailwind CSS v3/v4 + Shadcn UI component primitives.
- **Icons:** Lucide React (`lucide-react`).
- **Data Visualization:** Recharts (for performance and median charts).
- **Backend & Database:** Supabase (PostgreSQL engine + Row Level Security + Auth).
- **Data Fetching:** React Server Components (RSC) for initial page loads and Next.js Server Actions for mutations.

## Engineering & Code Quality Rules
1. **Strict TypeScript:** No `any` types allowed under any circumstances. All models must import interfaces from `@/types/tracker.ts`.
2. **Sheet Color Consistency:** Strictly implement the soft-tint badge utility classes and subtle grid borders defined in `responsive-ui-design.md`.
3. **No Direct Client Database Mutations:** Client components must invoke Next.js Server Actions or API routes; direct DB writes from client components are forbidden.
4. **Optimistic Updates:** Daily log submissions and task status toggles must feature instant feedback or clear loading spinners.
5. **Standardized Server Action Response:**
   ```typescript
   export type ActionResponse<T> = {
     success: boolean;
     data?: T;
     error?: string;
   };