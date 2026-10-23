import { redirect } from 'next/navigation';

/**
 * The separate structure page was retired with migration 63: adding rows under
 * any row, moving, linking, section mapping and the progress source all live
 * on the checklist page now. Keep old links working.
 */
export default async function ChecklistStructureRedirect({ params }: { params: Promise<{ taskTag: string }> }) {
  redirect(`/tasks/${encodeURIComponent((await params).taskTag)}/checklist`);
}
