import { notFound, redirect } from 'next/navigation';

import { requireProfile } from '@/shared/session/profile';
import { getOwnedChecklists } from '@/modules/checklists';
import { checklistWorkHref } from '@/modules/checklists/client';
import { resolveTaskDetailRouteState } from '@/modules/tasks';

type Params = Promise<{ taskTag: string; nodeId: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Older links point at one checklist node. Every node now lives in a table on
 * the checklist page: a Page opens its own table, a Sub-mission its own
 * checklist, and any other row opens with its menu inside the table that
 * holds it.
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

  const owned = (await getOwnedChecklists(task.id)).get(node.id);
  const section = node.section ?? 'activity';
  if (owned) redirect(checklistWorkHref(task.taskTag, { checklistId: owned, section: 'activity' }));
  if (node.nodeType === 'Page' || node.nodeType === 'Group') {
    redirect(checklistWorkHref(task.taskTag, { checklistId: node.checklistId, parentNodeId: node.id, section }));
  }
  const parent = node.parentNodeId ? checklistNodes.find(n => n.id === node.parentNodeId) : undefined;
  const parentIsPage = parent && (parent.nodeType === 'Page' || parent.nodeType === 'Group');
  redirect(checklistWorkHref(
    task.taskTag,
    parentIsPage ? { checklistId: node.checklistId, parentNodeId: parent.id, section } : { checklistId: node.checklistId, section },
    node.id,
  ));
}
