import { describe, expect, it } from 'vitest';

import { fileStorageLine, fileViewHref, isFileBucket, type FileStorageHealth } from '@/modules/files/client';

const base: FileStorageHealth = { available: true, configured: true, connected: true, driveName: 'TaskPulse Files', account: 'a@b.iam.gserviceaccount.com', moved: 0, pending: 0, error: null };

describe('file storage rules', () => {
  it('links every view through the permission-checked route', () => {
    expect(fileViewHref('personal-documents', 'org/user/aadhaar/x.pdf')).toBe('/api/files?b=personal-documents&p=org%2Fuser%2Faadhaar%2Fx.pdf');
    expect(isFileBucket('personal-documents')).toBe(true);
    expect(isFileBucket('attendance-photos')).toBe(false);
  });

  it('says plainly when storage is not connected or unreachable', () => {
    expect(fileStorageLine({ ...base, configured: false }).attention).toBe(true);
    const down = fileStorageLine({ ...base, connected: false, error: 'Google Drive answered 404' });
    expect(down.attention).toBe(true);
    expect(down.text).toContain('Google Drive answered 404');
  });

  it('reports moved and waiting files', () => {
    expect(fileStorageLine({ ...base, moved: 1 }).text).toBe('Files are stored in the Shared Drive "TaskPulse Files": 1 file so far.');
    const waiting = fileStorageLine({ ...base, moved: 3, pending: 2, error: 'timeout' });
    expect(waiting.text).toContain('2 files waiting to move (last error: timeout)');
    expect(waiting.attention).toBe(true);
  });
});
