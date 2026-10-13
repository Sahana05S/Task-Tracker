'use client';
import { recordTaskReview } from '@/app/tasks/actions';
import { ExecutionForm } from '@/components/tasks/execution-form';
import { Button } from '@/components/ui/button';
export function TaskReviewForm({taskId,version}: {taskId: string;version: number}) {
 return <ExecutionForm action={form=>recordTaskReview(null,form)} scope="review" className="grid gap-2">
  <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="expectedVersion" value={version} />
  <p className="text-sm">Record your assigned review. Changes to reviewed work invalidate approval.</p>
  <div className="flex gap-2"><Button name="approved" value="true" size="sm">Approve review</Button><Button name="approved" value="false" size="sm" variant="outline">Request changes</Button></div>
 </ExecutionForm>;
}
