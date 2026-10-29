'use client';

import { DownloadIcon } from 'lucide-react';

import { printPage } from '@/modules/mobile/client';
import { Button } from '@/shared/ui/button';

/**
 * Opens the print dialog; "Save as PDF" there downloads the sheet. In the
 * Android app that is Android's print service, since its WebView ignores window.print().
 */
export function PrintButton({ label = 'Download PDF' }: { label?: string }) {
  return (
    <Button type="button" className="no-print" onClick={() => void printPage().catch(() => window.print())}>
      <DownloadIcon aria-hidden="true" />
      {label}
    </Button>
  );
}
