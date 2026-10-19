import { redirect } from 'next/navigation';

/** The checklist workspace moved to /tasks/[taskTag]/checklist; keep old links working. */
export default async function ChecklistWorkRedirect({ params, searchParams }: {
  params: Promise<{ taskTag: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === 'string') query.set(key, value);
  redirect(`/tasks/${encodeURIComponent((await params).taskTag)}/checklist${query.size ? `?${query}` : ''}`);
}
