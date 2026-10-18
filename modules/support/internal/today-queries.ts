import { createClient } from '@/shared/supabase/server';

/**
 * Contribution reads for the Today page. Each throws on a query error so the
 * caller can show its section as unavailable, never as zero. PRIVATE.
 */

type StateRow = { validation_state?: string | null };

/** Validation states of the member's facts, ideas and suggestions dated between two dates, inclusive. */
export async function getMemberContributionStates(userId: string, from: string, to: string): Promise<{
  facts: StateRow[]; ideas: StateRow[]; suggestions: StateRow[];
}> {
  const db = await createClient();
  const [facts, ideas, suggestions] = await Promise.all([
    db.from('daily_facts').select('validation_state').eq('posted_by', userId).gte('fact_date', from).lte('fact_date', to),
    db.from('ideas').select('validation_state').eq('posted_by', userId).gte('idea_date', from).lte('idea_date', to),
    db.from('suggestions').select('validation_state').eq('posted_by', userId).gte('suggestion_date', from).lte('suggestion_date', to),
  ]);
  for (const r of [facts, ideas, suggestions]) if (r.error) throw r.error;
  return { facts: facts.data ?? [], ideas: ideas.data ?? [], suggestions: suggestions.data ?? [] };
}

export interface RecentValidatedContribution {
  id: string;
  kind: 'fact' | 'idea' | 'suggestion';
  author: string | null;
  content: string;
  at: string | null | undefined;
}

/** The three most recently validated facts, ideas and suggestions each (up to nine rows, unsorted overall). */
export async function getRecentValidatedContributions(): Promise<RecentValidatedContribution[]> {
  const db = await createClient();
  const [facts, ideas, suggestions] = await Promise.all([
    db.from('daily_facts').select('id,posted_by,fact,validation_at').eq('validation_state', 'validated')
      .order('validation_at', { ascending: false }).limit(3),
    db.from('ideas').select('id,posted_by,idea,validation_at').eq('validation_state', 'validated')
      .order('validation_at', { ascending: false }).limit(3),
    db.from('suggestions').select('id,posted_by,suggestion,validation_at').eq('validation_state', 'validated')
      .order('validation_at', { ascending: false }).limit(3),
  ]);
  for (const r of [facts, ideas, suggestions]) if (r.error) throw r.error;
  return [
    ...(facts.data ?? []).map((r) => ({ id: r.id, kind: 'fact' as const, author: r.posted_by, content: r.fact, at: r.validation_at })),
    ...(ideas.data ?? []).map((r) => ({ id: r.id, kind: 'idea' as const, author: r.posted_by, content: r.idea, at: r.validation_at })),
    ...(suggestions.data ?? []).map((r) => ({ id: r.id, kind: 'suggestion' as const, author: r.posted_by, content: r.suggestion, at: r.validation_at })),
  ];
}
