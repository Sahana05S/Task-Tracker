/** PUBLIC client-safe API of the files module: types and pure helpers. */
export { FILE_BUCKETS, fileStorageLine, fileViewHref, isFileBucket } from './internal/rules';
export type { FileBucket, FileStorageHealth } from './internal/rules';
export {
  formatFileSize,
  mapProofRow,
  MAX_PROOF_BYTES,
  PROOF_ACCEPT,
  PROOF_MIME_EXTENSIONS,
  proofFileProblem,
  proofMimeType,
  proofPath,
  type ProofFile,
} from './internal/proof-rules';
export { uploadToSignedLink } from './internal/upload';
