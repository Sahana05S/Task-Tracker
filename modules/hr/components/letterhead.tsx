import type { CompanyBranding, CompanyLetterhead } from '@/modules/settings/client';

/**
 * The company letterhead (M19): full logo (or mark) and name, contact lines,
 * a coloured band, the page body and a footer. Rendered as a `.paper` sheet,
 * white in both themes and printed without the app around it.
 */
export function Letterhead({ branding, letterhead, children, footer }: {
  branding: CompanyBranding;
  letterhead: CompanyLetterhead;
  children?: React.ReactNode;
  /** Extra footer text, e.g. a version line. */
  footer?: React.ReactNode;
}) {
  const logo = branding.logoUrl ?? branding.markUrl;
  const contact = [letterhead.phone, letterhead.email, letterhead.website].filter(Boolean);
  const name = branding.companyName || 'Company';
  return (
    <article className="paper" aria-label={`${name} letterhead`}>
      <header className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-center gap-3">
          {logo ? <img src={logo} alt={`${name} logo`} className="h-14 max-w-[45%] shrink-0 object-contain sm:h-16" /> : null}
          {!branding.logoUrl ? <span className="text-[15pt] leading-tight font-bold">{name}</span> : null}
        </div>
        <div className="paper-muted min-w-0 text-right text-[8.5pt] leading-snug">
          {branding.logoUrl ? <p className="paper-accent !mb-0.5 text-[10pt] font-semibold">{name}</p> : null}
          {letterhead.address ? <p className="!mb-0 whitespace-pre-line">{letterhead.address}</p> : null}
          {contact.length ? <p className="!mb-0">{contact.join(' · ')}</p> : null}
        </div>
      </header>
      <div aria-hidden="true" className="paper-band mt-4 mb-6 h-1 rounded-full" />
      <div className="flex-1">{children}</div>
      <footer className="paper-rule paper-muted mt-8 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2 text-[8pt]">
        <span>{[name, letterhead.registrationNo].filter(Boolean).join(' · ')}</span>
        {footer ? <span>{footer}</span> : null}
      </footer>
    </article>
  );
}
