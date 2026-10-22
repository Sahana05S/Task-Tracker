import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChart3Icon,
  CalendarCheckIcon,
  ClockIcon,
  FileTextIcon,
  ListChecksIcon,
  ListTodoIcon,
  RocketIcon,
  ScrollTextIcon,
  TrophyIcon,
  type LucideIcon,
} from 'lucide-react';

import { GUIDE_TOPICS, type GuideTopicContent } from '@/modules/guide/internal/topics';
import { CATEGORY_LABELS, MILESTONE_STATUSES, ROLE_LABELS, TASK_CATEGORIES, USER_ROLES } from '@/shared/tracker/enums';
import { CATEGORY_MEANINGS, GLOSSARY, guideHref, MILESTONE_STATUS_MEANINGS, ROLE_MEANINGS, type GuideTopic } from '@/shared/tracker/labels';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

const ICONS: Record<GuideTopic, LucideIcon> = {
  missions: ListChecksIcon,
  checklist: ListTodoIcon,
  time: ClockIcon,
  records: CalendarCheckIcon,
  recognition: TrophyIcon,
  waypoints: RocketIcon,
  policies: ScrollTextIcon,
  reports: FileTextIcon,
  analytics: BarChart3Icon,
};

/** `/guide`: one card per feature, then every glossary term in a line. */
export function GuideIndex() {
  const terms = Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
  return (
    <MissionPage>
      <MissionPageHeader title="Guide" description="How TaskPulse works, in plain words. Pick a feature, or look up a term." />
      <nav aria-label="Guide topics">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDE_TOPICS.map(topic => {
            const Icon = ICONS[topic.slug];
            return (
              <li key={topic.slug}>
                <Link href={`/guide/${topic.slug}`} className="soft-card soft-card-interactive focus-visible:outline-primary grid h-full gap-1.5 p-5">
                  <span className="text-foreground flex items-center gap-2 font-bold tracking-tight">
                    <Icon className="text-primary size-5 shrink-0" aria-hidden="true" />{topic.title}
                  </span>
                  <span className="text-muted-foreground text-sm text-pretty">{topic.summary}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <section aria-labelledby="glossary" className="soft-card p-5 sm:p-6">
        <h2 id="glossary" className="text-foreground text-base font-bold tracking-tight">Glossary</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
          {terms.map(term => (
            <div key={term.term} className="grid gap-0.5">
              <dt className="text-foreground text-sm font-semibold">
                <Link href={guideHref(term)} className="link">{term.term}</Link>
              </dt>
              <dd className="text-muted-foreground text-sm text-pretty">{term.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="people-and-work" className="soft-card p-5 sm:p-6">
        <h2 id="people-and-work" className="text-foreground text-base font-bold tracking-tight">Roles, categories and milestones</h2>
        <div className="mt-3 grid gap-6 lg:grid-cols-3">
          <MeaningList title="Roles" entries={USER_ROLES.map(role => [ROLE_LABELS[role], ROLE_MEANINGS[role]])} />
          <MeaningList title="Mission categories" entries={TASK_CATEGORIES.map(code => [`${CATEGORY_LABELS[code]} (${code})`, CATEGORY_MEANINGS[code]])} />
          <MeaningList title="Milestone stages" entries={MILESTONE_STATUSES.map(status => [status, MILESTONE_STATUS_MEANINGS[status]])} />
        </div>
      </section>
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

/** `/guide/[topic]`: the topic's sections, its contents, where to find it and the next topic. */
export function GuideTopicPage({ topic }: { topic: GuideTopicContent }) {
  const index = GUIDE_TOPICS.findIndex(t => t.slug === topic.slug);
  const previous = GUIDE_TOPICS[index - 1];
  const next = GUIDE_TOPICS[index + 1];
  const Icon = ICONS[topic.slug];
  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={<Link href="/guide" className="link justify-self-start text-sm">Guide</Link>}
        title={topic.title}
        description={topic.summary}
        actions={topic.links.map(link => (
          <Link key={link.href} href={link.href} className="border-border text-foreground hover:bg-muted focus-visible:outline-primary inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold">
            {link.label}
          </Link>
        ))}
      />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={`${topic.title} contents`} className="h-fit lg:sticky lg:top-[calc(var(--spacing-header)+1.5rem)]">
          <p className="eyebrow mb-2 flex items-center gap-1.5"><Icon className="size-3.5" aria-hidden="true" />On this page</p>
          <ul className="border-border grid gap-0.5 border-l text-sm">
            {topic.sections.map(section => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-muted-foreground hover:text-foreground focus-visible:outline-primary -ml-px block border-l border-transparent py-1 pl-3 hover:border-current">
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="grid max-w-[68ch] content-start gap-8">
          {topic.sections.map(section => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="grid scroll-mt-[calc(var(--spacing-header)+1.5rem)] gap-3">
              <h2 id={`${section.id}-heading`} className="text-foreground text-lg font-bold tracking-tight">{section.heading}</h2>
              {section.paragraphs.map(paragraph => <p key={paragraph} className="text-foreground/90 leading-relaxed text-pretty">{paragraph}</p>)}
              {section.terms ? (
                <dl className="border-border divide-border divide-y rounded-xl border">
                  {section.terms.map(term => (
                    <div key={term.term} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-foreground text-sm font-semibold">{term.term}</dt>
                      <dd className="text-muted-foreground text-sm">{term.meaning}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          ))}
          <nav aria-label="More topics" className="border-border flex flex-wrap justify-between gap-3 border-t pt-5 text-sm">
            {previous ? <Link href={`/guide/${previous.slug}`} className="link inline-flex items-center gap-1.5"><ArrowLeftIcon className="size-4" aria-hidden="true" />{previous.title}</Link> : <span />}
            {next ? <Link href={`/guide/${next.slug}`} className="link inline-flex items-center gap-1.5">{next.title}<ArrowRightIcon className="size-4" aria-hidden="true" /></Link> : <Link href="/guide" className="link">All topics</Link>}
          </nav>
        </article>
      </div>
    </MissionPage>
  );
}
