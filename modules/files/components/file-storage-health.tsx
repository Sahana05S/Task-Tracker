import { HardDriveIcon } from 'lucide-react';

import { fileStorageLine, type FileStorageHealth } from '@/modules/files/client';
import { MissionNotice } from '@/shared/ui/mission-ui';

/** Reports > Data checks (managing director): whether files reach the company Shared Drive (migration 100). */
export function FileStorageHealthNotice({ health }: { health: FileStorageHealth }) {
  const line = fileStorageLine(health);
  return (
    <MissionNotice tone={line.attention ? 'attention' : 'info'} icon={HardDriveIcon} role="status">
      {line.text}
    </MissionNotice>
  );
}
