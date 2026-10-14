import Link from 'next/link';

export interface SnapshotButtonProps {year:number;month:number;periodLabel:string;storedCount:number}

/** Historical entry point now leads to the versioned archive controls. */
export function SnapshotButton({year,month,periodLabel}:SnapshotButtonProps){
 return <Link className="rounded border px-3 py-2 text-sm" href={`/reports?period=${year}-${String(month).padStart(2,'0')}`}>
  Review {periodLabel} archive
 </Link>;
}
