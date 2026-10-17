import Link from 'next/link';
import {
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  ListChecksIcon,
  PenToolIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/shared/utils';
import type { TaskDetailSection, TaskLink } from '@/types/tracker';

/** A mission's Input / Process / Output assets and reference links. */

export function AssetGroup({
  title,
  links,
  sections,
  empty,
  extraLink,
}: {
  title: string;
  links: readonly TaskLink[];
  sections: readonly TaskDetailSection[];
  empty: string;
  extraLink?: { label: string; href: string };
}) {
  const hasContent = links.length > 0 || sections.length > 0 || extraLink;

  return (
    <div className="grid content-start gap-2">
      <h3 className="eyebrow text-muted-foreground">{title}</h3>
      {hasContent ? (
        <>
          {sections.map((section) => (
            <div key={section.id} className="bg-muted/70 rounded-xl px-3.5 py-2.5">
              <p className="text-foreground text-sm font-medium">{section.title}</p>
              {section.content ? (
                <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{section.content}</p>
              ) : null}
            </div>
          ))}
          {links.map((link) => (
            <AssetLink key={link.id} link={link} />
          ))}
          {extraLink ? (
            <Link
              href={extraLink.href}
              className="bg-muted/70 hover:bg-primary-subtle flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors"
            >
              <span aria-hidden="true" className="text-primary flex size-8 shrink-0 items-center justify-center rounded-lg bg-white">
                <ListChecksIcon className="size-4" />
              </span>
              <span className="text-primary">{extraLink.label}</span>
            </Link>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </div>
  );
}

const LINK_ICONS: Record<string, LucideIcon> = {
  Folder: FolderIcon,
  Document: FileTextIcon,
  Account: UserIcon,
  Flowchart: PenToolIcon,
  Engineering: PenToolIcon,
  Drawing: PenToolIcon,
  Checklist: ListChecksIcon,
};

export function AssetLink({ link }: { link: TaskLink }) {
  const rawHref = link.url ?? link.storagePath;
  const href = rawHref && (/^https?:\/\//i.test(rawHref) || /^\/(team\/|reports#report-)/.test(rawHref)) ? rawHref : null;
  const Icon = LINK_ICONS[link.linkType] ?? LinkIcon;
  const body = (
    <>
      <span aria-hidden="true" className="text-primary flex size-8 shrink-0 items-center justify-center rounded-lg bg-white">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', href ? 'text-foreground' : 'text-muted-foreground')}>
          {link.label}
        </span>
        <span className="text-muted-foreground block text-xs">{link.linkType}</span>
      </span>
      {href ? <ExternalLinkIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" /> : null}
    </>
  );

  if (!href) {
    return <div className="bg-muted/70 flex items-center gap-3 rounded-xl px-3.5 py-2.5">{body}</div>;
  }

  return (
    <a
      href={href}
      className="bg-muted/70 hover:bg-primary-subtle flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors"
      target="_blank"
      rel="noreferrer"
      aria-label={`${link.linkType}: ${link.label}`}
    >
      {body}
    </a>
  );
}
