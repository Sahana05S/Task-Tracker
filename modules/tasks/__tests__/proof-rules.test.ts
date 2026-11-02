import { describe, expect, it } from 'vitest';

import { formatProofSize, proofFileProblem, proofMimeType } from '@/modules/tasks/client';
import { proofPath } from '@/modules/tasks/internal/proofs/rules';

describe('mission proof rules', () => {
  it('takes the type from the name when the phone reports none (HEIC photos)', () => {
    expect(proofMimeType({ name: 'IMG_2041.HEIC', type: '' })).toBe('image/heic');
    expect(proofMimeType({ name: 'receipt.pdf', type: 'application/pdf' })).toBe('application/pdf');
    expect(proofMimeType({ name: 'site.jpeg', type: '' })).toBe('image/jpeg');
  });

  it('accepts PDF, photos and Office files up to 25 MB', () => {
    expect(proofFileProblem({ size: 1000, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBeNull();
    expect(proofFileProblem({ size: 25 * 1024 * 1024, type: 'image/jpeg' })).toBeNull();
    expect(proofFileProblem({ size: 25 * 1024 * 1024 + 1, type: 'image/jpeg' })).toBe('Files must be 25 MB or smaller.');
    expect(proofFileProblem({ size: 1000, type: 'video/mp4' })).toMatch(/Upload a PDF/);
    expect(proofFileProblem({ size: 0, type: 'application/pdf' })).toBe('The file is empty.');
  });

  it('builds the only path the bucket and the command accept', () => {
    expect(proofPath('org', 'task', 'file', 'image/heic')).toBe('org/task/file.heic');
    expect(formatProofSize(1536 * 1024)).toBe('1.5 MB');
  });
});
