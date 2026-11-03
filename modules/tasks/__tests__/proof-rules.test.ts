import { describe, expect, it } from 'vitest';

import { formatProofSize, isMissionFileKind, MISSION_DOCUMENT_KINDS, missionFileFolder, missionFilesOfKind, proofFileProblem, proofMimeType } from '@/modules/tasks/client';
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

describe('mission Input / Process / Output documents (migration 113)', () => {
  const files = (['proof', 'input', 'output', 'proof'] as const).map((kind, index) => ({
    id: String(index), kind, path: `p${index}`, fileName: `f${index}`, mimeType: 'application/pdf', sizeBytes: 1,
    uploadedAt: '2026-11-03T10:00:00Z', uploaderName: null, canRemove: false, href: '',
  }));

  it('keeps proofs and each document kind apart', () => {
    expect(missionFilesOfKind(files, 'proof').map((f) => f.id)).toEqual(['0', '3']);
    expect(missionFilesOfKind(files, 'input').map((f) => f.id)).toEqual(['1']);
    expect(missionFilesOfKind(files, 'process')).toEqual([]);
    expect(MISSION_DOCUMENT_KINDS).toEqual(['input', 'process', 'output']);
    expect(isMissionFileKind('output')).toBe(true);
    expect(isMissionFileKind('reference')).toBe(false);
  });

  it('files documents under Missions and proofs under Proofs, by the assigned month', () => {
    const task = { taskTag: 'Nov26_DES1', title: ' Villa layout ', assignedDate: '2026-10-28' };
    expect(missionFileFolder(task, 'proof', '2026-11-03')).toEqual(['Proofs', '2026-10', 'Nov26_DES1 - Villa layout']);
    expect(missionFileFolder(task, 'process', '2026-11-03')).toEqual(['Missions', '2026-10', 'Nov26_DES1 - Villa layout', 'Process']);
    expect(missionFileFolder({ taskTag: null, title: '', assignedDate: null }, 'input', '2026-11-03'))
      .toEqual(['Missions', '2026-11', 'Mission - Untitled', 'Input']);
  });
});
