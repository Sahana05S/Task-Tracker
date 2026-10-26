'use client';

import { DownloadIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';

/** Opens the browser's print dialog; "Save as PDF" there downloads the sheet. */
export function PrintButton({ label = 'Download PDF' }: { label?: string }) {
  return (
    <Button type="button" className="no-print" onClick={() => window.print()}>
      <DownloadIcon aria-hidden="true" />
      {label}
    </Button>
  );
}
