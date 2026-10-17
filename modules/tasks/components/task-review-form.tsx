'use client';
import { recordTaskReview } from '@/modules/tasks/actions';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
export function TaskReviewForm({taskId,version}: {taskId: string;version: number}) {
 return <ExecutionForm action={form=>recordTaskReview(null,form)} scope="review" className="grid gap-2">
  <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="expectedVersion" value={version} />
  <p className="text-muted-foreground text-sm">Record your assigned review. Changes to reviewed work invalidate approval.</p>
  <div className="flex flex-wrap gap-2"><Button name="approved" value="true" size="sm" className="rounded-xl">Approve review</Button><Button name="approved" value="false" size="sm" variant="outline" className="rounded-xl">Request changes</Button></div>
 </ExecutionForm>;
}
