import type { AttendanceStatus } from '@/types/tracker';

/** One colour and one short mark per status, so a cell never relies on colour alone. */
export const STATUS_STYLE: Record<AttendanceStatus, { readonly cell: string; readonly mark: string }> = {
  Present: { cell: 'bg-success-subtle text-success-strong', mark: 'P' },
  'Half Day': { cell: 'bg-teal-50 text-teal-800', mark: '½' },
  Absent: { cell: 'bg-danger-subtle text-danger-foreground', mark: 'A' },
  Leave: { cell: 'bg-recognition-subtle text-recognition-foreground', mark: 'L' },
  Holiday: { cell: 'bg-primary-subtle text-primary-subtle-foreground', mark: 'H' },
  'Off Hours': { cell: 'bg-slate-100 text-slate-700', mark: 'OH' },
};
