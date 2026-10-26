import { describe, expect, it } from 'vitest';

import {
  canViewPersonalRecords,
  fileProblem,
  formatFileSize,
  recordPath,
  recordProgress,
} from '@/modules/personnel/internal/rules';
import { mapPersonalRecords } from '@/modules/personnel/internal/mappers';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const FILE = '33333333-3333-4333-8333-333333333333';

describe('personal records rules', () => {
  it('builds the only path migration 78 accepts', () => {
    expect(recordPath(ORG, USER, 'aadhaar', FILE, 'application/pdf')).toBe(`${ORG}/${USER}/aadhaar/${FILE}.pdf`);
    expect(recordPath(ORG, USER, 'college', FILE, 'image/jpeg')).toBe(`${ORG}/${USER}/college/${FILE}.jpg`);
  });

  it('accepts PDF and images up to 5 MB only', () => {
    expect(fileProblem({ size: 5 * 1024 * 1024, type: 'application/pdf' })).toBeNull();
    expect(fileProblem({ size: 5 * 1024 * 1024 + 1, type: 'application/pdf' })).toMatch(/5 MB/);
    expect(fileProblem({ size: 10, type: 'application/msword' })).toMatch(/PDF/);
    expect(fileProblem({ size: 0, type: 'image/png' })).toMatch(/empty/);
  });

  it('counts the four kinds once each', () => {
    expect(recordProgress(['college', 'college', 'class10'])).toEqual({ done: 2, total: 4, complete: false, missing: ['class12', 'aadhaar'] });
    expect(recordProgress(['class10', 'class12', 'aadhaar', 'college']).complete).toBe(true);
  });

  it('shows the tab to the person and the managing director only', () => {
    expect(canViewPersonalRecords({ id: USER, role: 'team_member' }, USER)).toBe(true);
    expect(canViewPersonalRecords({ id: ORG, role: 'managing_director' }, USER)).toBe(true);
    expect(canViewPersonalRecords({ id: ORG, role: 'project_engineer' }, USER)).toBe(false);
  });

  it('formats sizes and drops unknown kinds', () => {
    expect(formatFileSize(1536 * 1024)).toBe('1.5 MB');
    expect(formatFileSize(300)).toBe('1 KB');
    const records = mapPersonalRecords({ userId: USER, documents: [{ id: FILE, kind: 'passport', path: 'x' }, { id: FILE, kind: 'class12', path: 'y', sizeBytes: 9 }] });
    expect(records.documents.map(document => document.kind)).toEqual(['class12']);
  });
});
