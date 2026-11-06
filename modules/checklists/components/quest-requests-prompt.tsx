import Link from 'next/link';
import { FlagIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { questOwnerRequest } from '../actions';
import { getMyQuestRequests } from '../internal/quest-requests';

/**
 * Today: requests to own a Quest on a mission the member is not on (migration 131). Accepting adds
 * them to that mission's Crew and makes them the Quest's owner; declining tells the person who asked.
 * Hidden when there is none, or before migration 131.
 */
export async function QuestRequestsPrompt() {
  const requests = await getMyQuestRequests().catch(() => null);
  if (!requests?.length) return null;
  return (
    <section aria-label="Quest owner requests" className="border-border bg-card mb-5 grid gap-3 rounded-xl border px-4 py-3">
      {requests.map((request) => (
        <div key={request.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <FlagIcon aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-foreground text-sm font-semibold break-words">
                {request.requesterName} asks you to own “{request.questTitle}”
              </p>
              <p className="text-muted-foreground text-xs">
                On <Link href={`/tasks/${encodeURIComponent(request.taskTag)}`} className="link">{request.taskTag}</Link> · {request.taskTitle}.
                Accepting adds you to the mission&apos;s Crew.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(['accept', 'decline'] as const).map((op) => (
              <ExecutionForm key={op} action={questOwnerRequest} scope={`quest-request:${request.id}:${op}`}>
                <input type="hidden" name="op" value={op} />
                <input type="hidden" name="request_id" value={request.id} />
                <Button type="submit" size="sm" variant={op === 'accept' ? 'default' : 'outline'}>
                  {op === 'accept' ? 'Accept' : 'Decline'}
                </Button>
              </ExecutionForm>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
