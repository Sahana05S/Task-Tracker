import { notFound, redirect } from 'next/navigation';

import { requireProfile } from '@/shared/session/profile';
import { checklistWorkHref } from '@/modules/checklists/client';
import { resolveTaskDetailRouteState } from '@/modules/tasks';

type Params = Promise<{ taskTag: string; nodeId: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Older links point at one checklist node. Every row lives in a table on the
 * checklist page: a row with rows under it opens their table, and any other
 * row opens with its menu inside the table that holds it.
 */
export default async function ChecklistNodeRedirect({ params }: { params: Params }) {
  const { taskTag, nodeId } = await params;
  if (!UUID.test(nodeId)) notFound();
  await requireProfile();
  const route = await resolveTaskDetailRouteState(taskTag);
  if (route.status !== 'ready') notFound();
  const { task, checklistNodes } = route.data;
  const node = checklistNodes.find(n => n.id === nodeId);
  if (!node) notFound();

  const section = node.section ?? 'activity';
  if (checklistNodes.some(n => n.parentNodeId === node.id)) {
    redirect(checklistWorkHref(task.taskTag, { checklistId: node.checklistId, parentNodeId: node.id, section }));
  }
  redirect(checklistWorkHref(
    task.taskTag,
    node.parentNodeId ? { checklistId: node.checklistId, parentNodeId: node.parentNodeId, section } : { checklistId: node.checklistId, section },
    node.id,
  ));
}
