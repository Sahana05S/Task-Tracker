import * as React from 'react';
import { CheckIcon, MinusIcon } from 'lucide-react';

import {
  GOVERNANCE_CAPABILITIES,
  PERFORMANCE_FORMULAS,
  PLATFORM_FACTS,
  ROLE_MATRIX,
} from '@/lib/marketing/content';
import { ROLE_LABELS, USER_ROLES } from '@/lib/tracker/enums';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/tracker';

/**
 * System architecture and governance.
 *
 * Occupies the slot a pricing matrix would normally take, and answers the question
 * that matters for this kind of system instead: who can do what, where that is
 * enforced, and how the numbers are derived.
 *
 * Three cards — Row-Level Security, Role Governance, Auditability — then the
 * permission matrix as actually enforced, then the arithmetic written out in full.
 * The two tables are deliberately dense: they are reference material, and they
 * reuse the same `sheet-grid` classes as the real workspace so the page cannot
 * advertise a look the product does not have.
 *
 * A Server Component: nothing here is interactive.
 */
export function SystemCapabilities() {
  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-heading"
      className="border-border bg-background border-b"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex max-w-2xl flex-col gap-4">
          <span className="eyebrow text-primary">System capabilities</span>
          <h2
            id="capabilities-heading"
            className="text-foreground text-3xl font-semibold sm:text-4xl"
          >
            Governance enforced in the database, not in the interface
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
            Access control that only exists in the client is a suggestion. These are
            the guarantees TaskPulse makes at the data layer, the roles that sit on
            top of them, and the arithmetic they protect.
          </p>
        </div>

        {/* Capability cards */}
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {GOVERNANCE_CAPABILITIES.map(
            ({ id, title, summary, detail, specifics, icon: Icon }) => (
              <article key={id} className="soft-card flex flex-col gap-5 p-6">
                <span className="bg-primary-subtle text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Icon className="size-5" aria-hidden="true" />
                </span>

                <div className="flex flex-col gap-2">
                  <h3 className="text-foreground text-lg font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="text-foreground text-sm font-medium">{summary}</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {detail}
                  </p>
                </div>

                <ul className="border-border mt-auto flex flex-col gap-2 border-t pt-4">
                  {specifics.map((item) => (
                    <li
                      key={item}
                      className="text-muted-foreground flex items-start gap-2 text-xs"
                    >
                      <span
                        aria-hidden="true"
                        className="bg-primary mt-1.5 size-1 shrink-0 rounded-full"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ),
          )}
        </div>

        {/* Platform facts. Bare figures; the label does the naming. */}
        <dl className="soft-card mt-4 grid grid-cols-2 gap-6 px-6 py-5 lg:grid-cols-4">
          {PLATFORM_FACTS.map(({ value, label }) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="sr-only">{label}</dt>
              <dd className="stat-figure text-foreground">{value}</dd>
              <dd className="text-muted-foreground text-xs">{label}</dd>
            </div>
          ))}
        </dl>

        {/* Permission matrix and formulas */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <RoleGovernanceMatrix />
          <PerformanceMath />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Role matrix                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Permission matrix.
 *
 * Column order comes from `USER_ROLES` and the headings from `ROLE_LABELS`, so the
 * table is generated from the same source the application authorises against
 * rather than transcribed alongside it.
 *
 * A granted cell carries a tick plus visually hidden text; a withheld cell a dash
 * plus its own. Colour and glyph alone would leave the table unreadable to a screen
 * reader.
 */
function RoleGovernanceMatrix() {
  return (
    <div
      id="role-governance"
      className="soft-card-clip flex flex-col gap-3 p-4"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="text-foreground text-sm font-semibold">
          Role governance matrix
        </h3>
        <p className="text-muted-foreground text-xs">
          Enforced in the Server Action and again by the row-level security policy.
          Anything not granted is refused.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="sheet-grid text-xs">
          <caption className="sr-only">
            Capabilities granted to each workspace role
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sheet-grid-frozen min-w-56">
                Capability
              </th>
              {USER_ROLES.map((role) => (
                <th key={role} scope="col" className="text-center">
                  {/* Two lines so the column stays narrow in a dense table. */}
                  {ROLE_LABELS[role].split(' ').map((word) => (
                    <span key={word} className="block leading-tight">
                      {word}
                    </span>
                  ))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLE_MATRIX.map((permission) => (
              <tr key={permission.id}>
                <th
                  scope="row"
                  className="sheet-grid-frozen text-muted-foreground text-left font-normal"
                >
                  {permission.capability}
                </th>
                {USER_ROLES.map((role) => (
                  <PermissionCell
                    key={role}
                    role={role}
                    capability={permission.capability}
                    granted={permission.grantedTo.includes(role)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PermissionCell({
  role,
  capability,
  granted,
}: {
  role: UserRole;
  capability: string;
  granted: boolean;
}) {
  return (
    <td className="text-center">
      <span
        className={cn(
          'inline-flex size-5 items-center justify-center rounded border',
          granted
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-border bg-muted text-slate-300',
        )}
      >
        {granted ? (
          <CheckIcon className="size-3" aria-hidden="true" />
        ) : (
          <MinusIcon className="size-3" aria-hidden="true" />
        )}
        <span className="sr-only">
          {ROLE_LABELS[role]}: {capability} {granted ? 'granted' : 'not granted'}
        </span>
      </span>
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* Performance math                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The formulas, written out.
 *
 * Published rather than summarised because a performance figure nobody can
 * reproduce is not evidence. Expressions are plain text, so no maths renderer is
 * pulled onto a public page for six lines of notation.
 */
function PerformanceMath() {
  return (
    <div id="performance-math" className="soft-card flex flex-col gap-3 p-4">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-foreground text-sm font-semibold">Performance math</h3>
        <p className="text-muted-foreground text-xs">
          Every figure on the dashboard reduces to one of these.
        </p>
      </header>

      <dl className="divide-border flex flex-col divide-y">
        {PERFORMANCE_FORMULAS.map(({ id, name, expression, note }) => (
          <div key={id} className="flex flex-col gap-1.5 py-3 first:pt-0">
            <dt className="text-foreground text-xs font-medium">{name}</dt>
            <dd>
              {/* Monospaced, like every other figure in the product. */}
              <code className="border-border text-foreground block rounded border bg-[#fbfcfd] px-2 py-1 font-mono text-[11px]">
                {expression}
              </code>
            </dd>
            <dd className="text-muted-foreground text-xs">{note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
