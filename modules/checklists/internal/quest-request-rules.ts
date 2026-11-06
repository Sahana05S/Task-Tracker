/** Quest owner requests (migration 131): payload shapes and mappers. PRIVATE (types re-exported by client.ts). */

export interface MyQuestRequest {
  id: string;
  taskId: string;
  taskTag: string;
  taskTitle: string;
  nodeId: string;
  questTitle: string;
  requesterName: string;
  createdAt: string;
}

export interface PendingQuestRequest {
  id: string;
  nodeId: string;
  inviteeId: string;
  inviteeName: string;
  requestedBy: string;
}

export interface QuestRequests {
  pending: PendingQuestRequest[];
  /** Active members who are not on the Crew and do not review the mission. */
  candidates: { id: string; name: string }[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];

export function mapMyQuestRequests(data: unknown): MyQuestRequest[] {
  return list(data).map((row) => ({
    id: text(row.id), taskId: text(row.taskId), taskTag: text(row.taskTag), taskTitle: text(row.taskTitle),
    nodeId: text(row.nodeId), questTitle: text(row.questTitle), requesterName: text(row.requesterName) || 'A member',
    createdAt: text(row.createdAt),
  })).filter((row) => row.id && row.taskTag);
}

export function mapQuestRequestsFor(data: unknown): QuestRequests {
  const object = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    pending: list(object.pending).map((row) => ({
      id: text(row.id), nodeId: text(row.nodeId), inviteeId: text(row.inviteeId),
      inviteeName: text(row.inviteeName) || 'A member', requestedBy: text(row.requestedBy),
    })).filter((row) => row.id && row.nodeId),
    candidates: list(object.candidates).map((row) => ({ id: text(row.id), name: text(row.name) || 'A member' })).filter((row) => row.id),
  };
}
