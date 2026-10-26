/**
 * HR documents and reviews (M19). PRIVATE; re-exported through `client.ts`.
 */

export const CONDUCT_TITLE_MAX = 120;
export const CONDUCT_BODY_MAX = 20000;

export const DEFAULT_CONDUCT_TITLE = 'Code of Conduct';

/**
 * A starting draft the managing director edits before publishing; nothing is
 * stored until they publish. Plain text: "# " starts a heading, "- " a bullet.
 */
export const DEFAULT_CONDUCT_BODY = `This Code of Conduct sets out how we work with each other, with our customers and with our partners. It applies to every employee, trainee and consultant of the company, at the office, on site and online.

# 1. Integrity and honesty
- Be truthful in what you say, record and report, including time logs, attendance and expenses.
- Never offer, ask for or accept a bribe, kickback or personal favour in return for business.
- Declare any personal interest that could affect a decision you take for the company.

# 2. Respect at work
- Treat colleagues, customers and site workers with courtesy, whatever their role.
- Harassment, discrimination and bullying of any kind are not tolerated. Report them to the managing director.
- Keep disagreements professional and raise concerns early.

# 3. Customers and partners
- Give customers accurate information about projects, prices, approvals and timelines.
- Keep promises you make on behalf of the company, or escalate early when you cannot.

# 4. Safety on site
- Wear the protective equipment the site requires and follow every safety instruction.
- Stop work and report any unsafe condition straight away.

# 5. Confidential information
- Customer details, prices, drawings and company plans stay inside the company.
- Do not share passwords or use company data for personal purposes.

# 6. Company property and time
- Use company equipment, vehicles and materials with care and only for work.
- Be on time, record your attendance honestly and inform your manager before any absence.

# 7. Social media and public statements
- Do not post confidential information, site photos or customer details without approval.
- Only the managing director speaks for the company in public.

# 8. Raising concerns
- Report any breach of this Code to your manager or the managing director. Concerns raised in good faith are never held against you.

Breaking this Code can lead to disciplinary action, up to and including termination.`;

export type ConductBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

/** Plain text -> headings ("# "), bullet lists ("- ") and paragraphs (blank-line separated). */
export function conductBlocks(body: string): ConductBlock[] {
  const blocks: ConductBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('# ')) { flush(); blocks.push({ kind: 'heading', text: line.slice(2).trim() }); continue; }
    if (/^[-*•] /.test(line)) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'list') last.items.push(line.slice(2).trim());
      else blocks.push({ kind: 'list', items: [line.slice(2).trim()] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Performance reviews (migration 81)                                         */
/* -------------------------------------------------------------------------- */

export const REVIEW_STATUSES = ['awaiting_self', 'awaiting_md', 'completed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  awaiting_self: 'With the employee',
  awaiting_md: 'Ready for the director',
  completed: 'Completed',
};

export const SCORE_LABELS: Record<number, string> = {
  1: 'Needs improvement',
  2: 'Below expectations',
  3: 'Meets expectations',
  4: 'Exceeds expectations',
  5: 'Outstanding',
};

export const REVIEW_LINES_MAX = 10;
export const REVIEW_LINE_LENGTH = 300;
export const REVIEW_COMMENT_MAX = 500;
export const REVIEW_SUMMARY_MAX = 2000;

/** The average of the given scores to two decimals; null when none is set. */
export function averageScore(scores: readonly (number | null)[]): number | null {
  const set = scores.filter((score): score is number => score !== null);
  return set.length ? Math.round((set.reduce((sum, score) => sum + score, 0) / set.length) * 100) / 100 : null;
}

/** A textarea's lines -> the pros or cons list the database keeps (trimmed, bullets and empty lines dropped, at most 10). */
export function toLines(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim().replace(/^[-*•]\s*/, '').trim()).filter(Boolean).slice(0, REVIEW_LINES_MAX);
}
