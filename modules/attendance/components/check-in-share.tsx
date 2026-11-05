'use client';

import { useEffect } from 'react';

import { runHandoff, type CheckInKind } from '@/modules/attendance/client';
import { ShareText } from '@/shared/ui/share-text';

/**
 * The drafted check-in greeting or check-out report with Send on WhatsApp,
 * Copy and Share. When it appears right after this page saved a check-in or
 * check-out of the same kind, it opens WhatsApp with the message once; after
 * a reload it only shows the panel.
 */
export function CheckInShare({ kind, text, title }: { kind: CheckInKind; text: string; title: string }) {
  useEffect(() => {
    runHandoff({ kind, text }, Date.now(), href => window.location.assign(href));
  }, [kind, text]);
  return <ShareText text={text} title={title} />;
}
