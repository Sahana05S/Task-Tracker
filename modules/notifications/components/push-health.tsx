import { SmartphoneIcon } from 'lucide-react';

import { pushHealthLine, type PushStatusState } from '@/modules/notifications/client';
import { MissionNotice } from '@/shared/ui/mission-ui';

/** Reports > Data checks (managing director): whether phone notifications reach people (migration 91). */
export function PushHealth({ state }: { state: PushStatusState }) {
  const line = pushHealthLine(state);
  return (
    <MissionNotice tone={line.attention ? 'attention' : 'info'} icon={SmartphoneIcon} role="status">
      {line.text}
    </MissionNotice>
  );
}
