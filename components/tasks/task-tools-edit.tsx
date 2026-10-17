'use client';
import { useState } from 'react';
import { TaskDialog } from '@/components/tasks/task-dialog';
import { Button } from '@/components/ui/button';
import type { Task, User } from '@/types/tracker';

export function TaskToolsEdit({ tasks, members }: {tasks: readonly Task[]; members: readonly User[]}) {
  const [id,setId] = useState('');
  const [open,setOpen] = useState(false);
  const task = tasks.find((entry) => entry.id === id) ?? null;
  return <div className="grid gap-2">
    <select aria-label="Task to edit" value={id} onChange={(event) => setId(event.target.value)} className="field">
      <option value="">Select task</option>
      {tasks.map((entry) => <option key={entry.id} value={entry.id}>{entry.taskTag}: {entry.title}</option>)}
    </select>
    <Button disabled={!task} onClick={() => setOpen(true)} size="sm" className="justify-self-start">Edit task details and shares</Button>
    {task ? <TaskDialog key={task.id} open={open} onOpenChange={setOpen} task={task} members={members} defaultAssigneeId={task.assigneeId} /> : null}
  </div>;
}
