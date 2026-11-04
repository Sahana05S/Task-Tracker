'use client';

import { ProofFiles } from '@/modules/files/components/proof-files';
import type { ProofFile } from '@/modules/files/client';
import { removeSaleProof, saveSaleProof, startSaleProofUpload } from '@/modules/support/sales-proof-actions';

/** A sales entry's proofs (migration 102), shown only to its salesperson and managers. */
export function SaleProofs({ saleId, canAdd, proofs, driveReady }: { saleId: string; canAdd: boolean; proofs: readonly ProofFile[]; driveReady?: boolean }) {
  return (
    <ProofFiles
      bucket="sales-proofs"
      files={proofs}
      canAdd={canAdd}
      fields={{ saleId }}
      start={startSaleProofUpload}
      save={saveSaleProof}
      remove={removeSaleProof}
      driveReady={driveReady}
    />
  );
}
