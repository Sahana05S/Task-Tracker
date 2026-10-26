import { redirect } from 'next/navigation';

/** HR opens on its documents. */
export default function HrPage() {
  redirect('/hr/documents');
}
