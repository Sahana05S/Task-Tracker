import Link from 'next/link';
import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react';

import { GUIDE_ALONG_THE_WAY, GUIDE_FLOW, GUIDE_GROUPS, guideTopic } from '@/modules/guide';
import { CATEGORY_LABELS, MILESTONE_STATUSES, ROLE_LABELS, TASK_CATEGORIES, USER_ROLES } from '@/shared/tracker/enums';
import { CATEGORY_MEANINGS, GLOSSARY, guideHref, MILESTONE_STATUS_MEANINGS, ROLE_MEANINGS } from '@/shared/tracker/labels';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

import { GlossarySearch } from './glossary-search';
import { GuideIconView } from './guide-icon';
import { TOPIC_ICON } from './topic-icons';

/**
 * `/guide`: how a month in TaskPulse runs as one numbered path, the topics in
 * three groups, then a searchable glossary.
 */
export function GuideIndex() {
  const entries = Object.values(GLOSSARY)
    .sort((a, b) => a.term.localeCompare(b.term))
    .map(term => ({ term: term.term, meaning: term.meaning, href: guideHref(term) }));

  return (
    <MissionPage>
      <MissionPageHeader title="Guide" description="How TaskPulse works, in plain words. Pick a feature, or look up a term." />

      <section aria-labelledby="how-it-works" className="hero-card grid gap-5 p-5 sm:p-7">
        <div className="grid gap-1">
          <h2 id="how-it-works" className="text-foreground text-xl font-bold tracking-tight">How TaskPulse works</h2>
          <p className="text-muted-foreground text-sm">From planning a mission to closing the month. Open any step to learn more.</p>
        </div>
        <ol className="grid lg:grid-cols-7 lg:gap-3">
          {GUIDE_FLOW.map((stop, index) => {
            const last = index === GUIDE_FLOW.length - 1;
            const topic = guideTopic(stop.topic)!;
            return (
              <li key={stop.topic} className="relative pb-3 last:pb-0 lg:pb-0">
                {!last ? <span aria-hidden="true" className="bg-primary/20 absolute top-12 bottom-0 left-[1.6875rem] w-px lg:hidden" /> : null}
                {!last ? (
                  <ChevronRightIcon aria-hidden="true" className="text-primary/50 absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 lg:block" />
                ) : null}
                <Link
                  href={`/guide/${stop.topic}`}
                  className="bg-card/80 border-border hover:border-primary/30 group relative flex h-full items-center gap-3 rounded-xl border p-3 transition-colors lg:flex-col lg:items-start lg:gap-2"
                >
                  <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    <span className="sr-only">Step </span>{index + 1}<span className="sr-only"> of {GUIDE_FLOW.length}:</span>
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-foreground flex items-start gap-1.5 text-sm font-semibold text-balance">
                      <GuideIconView name={stop.icon} className="text-primary mt-0.5 size-4 shrink-0" />
                      {stop.label}
                    </span>
                    <span className="text-muted-foreground text-xs">{topic.title}</span>
                  </span>
                  <ArrowRightIcon aria-hidden="true" className="text-muted-foreground group-hover:text-primary ml-auto size-4 shrink-0 lg:hidden" />
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Along the way:</span>
          {GUIDE_ALONG_THE_WAY.map(slug => {
            const topic = guideTopic(slug)!;
            const Icon = TOPIC_ICON[slug];
            return (
              <Link key={slug} href={`/guide/${slug}`} className="bg-card/80 border-border text-foreground hover:border-primary/30 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 font-medium">
                <Icon aria-hidden="true" className="text-primary size-4" />{topic.title}
              </Link>
            );
          })}
        </p>
      </section>

      {GUIDE_GROUPS.map(group => (
        <section key={group.title} aria-labelledby={`group-${group.title}`} className="grid gap-3">
          <h2 id={`group-${group.title}`} className="eyebrow">{group.title}</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {group.topics.map(slug => {
              const topic = guideTopic(slug)!;
              const Icon = TOPIC_ICON[slug];
              return (
                <li key={slug}>
                  <Link href={`/guide/${slug}`} className="soft-card-interactive group grid h-full content-start gap-3 p-5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="bg-primary-subtle text-primary-subtle-foreground flex size-10 items-center justify-center rounded-xl">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <ArrowRightIcon aria-hidden="true" className="text-muted-foreground group-hover:text-primary size-4 transition-colors" />
                    </span>
                    <span className="grid gap-1">
                      <span className="text-foreground font-bold tracking-tight">{topic.title}</span>
                      <span className="text-muted-foreground text-sm text-pretty">{topic.summary}</span>
                    </span>
                    <span className="text-muted-foreground text-xs font-medium">
                      {topic.sections.length} {topic.sections.length === 1 ? 'section' : 'sections'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <GlossarySearch entries={entries} />

      <details className="disclosure group">
        <summary className="flex min-h-11 list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
          Roles, categories and milestones
        </summary>
        <div className="grid gap-6 lg:grid-cols-3">
          <MeaningList title="Roles" entries={USER_ROLES.map(role => [ROLE_LABELS[role], ROLE_MEANINGS[role]])} />
          <MeaningList title="Mission categories" entries={TASK_CATEGORIES.map(code => [`${CATEGORY_LABELS[code]} (${code})`, CATEGORY_MEANINGS[code]])} />
          <MeaningList title="Milestone stages" entries={MILESTONE_STATUSES.map(status => [status, MILESTONE_STATUS_MEANINGS[status]])} />
        </div>
      </details>
    </MissionPage>
  );
}

function MeaningList({ title, entries }: { title: string; entries: readonly (readonly [string, string])[] }) {
  return (
    <div>
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <dl className="mt-2 grid gap-2">
        {entries.map(([term, meaning]) => (
          <div key={term}>
            <dt className="text-foreground text-sm font-medium">{term}</dt>
            <dd className="text-muted-foreground text-sm">{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
