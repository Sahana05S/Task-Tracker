import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, ChevronRightIcon } from 'lucide-react';

import { GUIDE_TOPICS, type GuideSection, type GuideTopicContent } from '@/modules/guide';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

import { GuideIconView } from './guide-icon';
import { TOPIC_ICON } from './topic-icons';
import { GuideVisualView } from './guide-visuals';

const SECTION_SCROLL = 'scroll-mt-[calc(var(--spacing-header)+1.5rem)]';

/**
 * `/guide/[topic]`: each section leads with an icon, one sentence and a
 * picture; the full explanation sits under "More detail", word for word.
 * Section ids are the anchors help tips link to, so they never change.
 */
export function GuideTopicPage({ topic }: { topic: GuideTopicContent }) {
  const index = GUIDE_TOPICS.findIndex(t => t.slug === topic.slug);
  const previous = GUIDE_TOPICS[index - 1];
  const next = GUIDE_TOPICS[index + 1];
  const TopicIcon = TOPIC_ICON[topic.slug];
  const count = topic.sections.length;

  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={<Link href="/guide" className="link justify-self-start text-sm">Guide</Link>}
        title={topic.title}
        description={topic.summary}
        actions={topic.links.map(link => (
          <Link key={link.href} href={link.href} className="border-border text-foreground hover:bg-muted inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold">
            {link.label}
          </Link>
        ))}
      />

      {count > 1 ? (
        <nav aria-label={`${topic.title}: sections`} className="lg:hidden">
          <ol className="flex flex-wrap gap-2">
            {topic.sections.map((section, i) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="border-border bg-card text-foreground hover:border-primary/30 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium">
                  <span className="bg-primary-subtle text-primary-subtle-foreground flex size-6 items-center justify-center rounded-full text-xs font-bold">{i + 1}</span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={`${topic.title} contents`} className="hidden h-fit lg:sticky lg:top-[calc(var(--spacing-header)+1.5rem)] lg:block">
          <p className="eyebrow mb-3 flex items-center gap-1.5"><TopicIcon className="size-3.5" aria-hidden="true" />On this page</p>
          <ol className="grid gap-1 text-sm">
            {topic.sections.map((section, i) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-start gap-2 rounded-lg px-2 py-1.5">
                  <span className="text-primary w-4 shrink-0 text-xs font-bold tabular-nums leading-5">{i + 1}</span>
                  <span>{section.heading}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="grid max-w-3xl content-start gap-5">
          {topic.sections.map((section, i) => <SectionCard key={section.id} section={section} position={i + 1} total={count} />)}
          <nav aria-label="More topics" className="border-border flex flex-wrap justify-between gap-3 border-t pt-5 text-sm">
            {previous ? (
              <Link href={`/guide/${previous.slug}`} className="link inline-flex min-h-11 items-center gap-1.5"><ArrowLeftIcon className="size-4" aria-hidden="true" />{previous.title}</Link>
            ) : <span />}
            {next ? (
              <Link href={`/guide/${next.slug}`} className="link inline-flex min-h-11 items-center gap-1.5">{next.title}<ArrowRightIcon className="size-4" aria-hidden="true" /></Link>
            ) : <Link href="/guide" className="link inline-flex min-h-11 items-center">All topics</Link>}
          </nav>
        </article>
      </div>
    </MissionPage>
  );
}

function SectionCard({ section, position, total }: { section: GuideSection; position: number; total: number }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className={`soft-card grid gap-4 p-5 sm:p-6 ${SECTION_SCROLL}`}>
      <div className="flex items-start gap-3">
        <span className="bg-primary-subtle text-primary-subtle-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
          <GuideIconView name={section.icon} className="size-5" />
        </span>
        <div className="grid min-w-0 gap-0.5">
          {total > 1 ? <p className="text-muted-foreground text-xs font-semibold">{position} of {total}</p> : null}
          <h2 id={`${section.id}-heading`} className="text-foreground text-lg leading-snug font-bold tracking-tight text-balance">{section.heading}</h2>
        </div>
      </div>
      <p className="text-foreground text-base leading-relaxed text-pretty">{section.lead}</p>
      {section.visual ? <GuideVisualView visual={section.visual} section={section} /> : null}
      <details className="disclosure group">
        <summary className="flex min-h-11 list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
          More detail
        </summary>
        <div className="grid max-w-[68ch] gap-3">
          {section.paragraphs.map(paragraph => <p key={paragraph} className="text-foreground/90 text-base leading-relaxed text-pretty">{paragraph}</p>)}
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
        </div>
      </details>
    </section>
  );
}
