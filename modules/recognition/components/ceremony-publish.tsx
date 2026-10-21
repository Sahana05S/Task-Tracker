'use client';

import { MegaphoneIcon } from 'lucide-react';

import { publishCeremonyAction } from '@/modules/recognition/ceremony-actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { Textarea } from '@/shared/ui/textarea';

/**
 * The director's publish control for an elapsed month. Publishing keeps the
 * results as the official ceremony; publishing again (after a correction)
 * keeps a new revision and needs a reason. The database decides who may
 * publish and recomputes the winners itself.
 */
export function CeremonyPublish({ month, expectedRevision }: { month: string; expectedRevision: number }) {
  const republish = expectedRevision > 0;
  return (
    <MissionPanel
      icon={MegaphoneIcon}
      title={republish ? 'Publish again' : 'Publish the ceremony'}
      subtitle={republish
        ? `Revision ${expectedRevision} is official. Publishing again keeps it in the history and makes the current results official.`
        : 'Makes these results the official ceremony for the month and adds the trophies to the hall of fame.'}
    >
      <ExecutionForm action={publishCeremonyAction} scope={`recognition-ceremony:${month}`}>
        <input type="hidden" name="month" value={month.slice(0, 7)} />
        <input type="hidden" name="expectedVersion" value={expectedRevision} />
        <label htmlFor="ceremony-reason" className="text-foreground text-sm font-medium">
          {republish ? 'Why is it being published again?' : 'Note (optional)'}
        </label>
        <Textarea id="ceremony-reason" name="reason" rows={2} required={republish} minLength={republish ? 8 : undefined} autoComplete="off"
          placeholder={republish ? 'For example: attendance for 12 Sep was corrected…' : 'For example: September awards…'} />
        <div>
          <Button type="submit">{republish ? 'Publish again' : 'Publish the ceremony'}</Button>
        </div>
      </ExecutionForm>
    </MissionPanel>
  );
}
