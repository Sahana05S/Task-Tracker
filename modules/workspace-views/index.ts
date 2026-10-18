// PUBLIC server-side API of workspace-views: the pages that combine several
// modules (shell navigation counts, Today). Server code imports from here;
// 'use client' components import '@/modules/workspace-views/client'.

export * from '@/modules/workspace-views/client';

export { getNavCounts } from '@/modules/workspace-views/internal/nav-counts';
export { getTodayData, weekStartOf } from '@/modules/workspace-views/internal/today';
