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
 * Occupies the slot a pricing matrix would normally take, and answers the
 * question that matters for this kind of system instead: who can do what, where
 * that is enforced, and how the numbers are derived.
 *
 * Three parts, in descending abstraction: the capability cards, the permission
 * matrix as actually enforced, and the arithmetic written out in full. The matrix
 * and the formula table are deliberately dense — they are reference material, and
 * the sheet aesthetic in `responsive-ui-design.md` is built for exactly that.
 *
 * A Server Component: nothing here is interactive.
 */
export function CapabilitiesGrid() {
  return (
    <section
      id="capabilities"
      aria-labelledby="capabilities-heading"
      className="border-b border-slate-200 bg-slate-50"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="flex max-w-2xl flex-col gap-3">
          <span className="text-xs font-semibold tracking-wide text-sky-700 uppercase">
            System capabilities
          </span>
          <h2
            id="capabilities-heading"
            className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Governance enforced in the database, not in the interface
          </h2>
          <p className="text-base text-slate-600">
            Access control that only exists in the client is a suggestion. These
            are the guarantees TaskPulse makes at the data layer, the roles that
            sit on top of them, and the arithmetic they protect.
          </p>
        </div>

        {/* Capability cards */}
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {GOVERNANCE_CAPABILITIES.map(
            ({ id, title, summary, detail, specifics, icon: Icon }) => (
              <article
                key={id}
                className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-slate-50">
                  <Icon className="size-5" aria-hidden="true" />
                </span>

                <div className="flex flex-col gap-1.5">
                  <h3 className="text-base font-semibold text-slate-900">
                    {title}
                  </h3>
                  <p className="text-sm font-medium text-slate-700">{summary}</p>
                  <p className="text-sm text-slate-600">{detail}</p>
                </div>

                <ul className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                  {specifics.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-xs text-slate-600"
                    >
                      <CheckIcon
                        className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ),
          )}
        </div>

        {/* Platform facts */}
        <dl className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4 lg:grid-cols-4">
          {PLATFORM_FACTS.map(({ value, label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col">
                <dt className="sr-only">{label}</dt>
                <dd className="text-lg font-semibold text-slate-900 [font-variant-numeric:tabular-nums]">
                  {value}
                </dd>
                <dd className="text-xs text-slate-500">{label}</dd>
              </div>
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
 * Column order comes from `USER_ROLES` and the headings from `ROLE_LABELS`, so
 * the table is generated from the same source the application authorises against
 * rather than transcribed alongside it.
 *
 * A granted cell carries a tick plus visually hidden text; a withheld cell a dash
 * plus its own. Colour and glyph alone would leave the table unreadable to a
 * screen reader.
 */
function RoleGovernanceMatrix() {
  return (
    <div
      id="role-governance"
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-slate-900">
          Role governance matrix
        </h3>
        <p className="text-xs text-slate-500">
          Enforced in the Server Action and again by the row-level security
          policy. Anything not granted is refused.
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
                  className="sheet-grid-frozen text-left font-normal text-slate-700"
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
          'inline-flex size-5 items-center justify-center rounded-full border',
          granted
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-50 text-slate-300',
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
    <div
      id="performance-math"
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-slate-900">
          Performance math
        </h3>
        <p className="text-xs text-slate-500">
          Every figure on the dashboard reduces to one of these.
        </p>
      </header>

      <dl className="flex flex-col divide-y divide-slate-100">
        {PERFORMANCE_FORMULAS.map(({ id, name, expression, note }) => (
          <div key={id} className="flex flex-col gap-1 py-2.5 first:pt-0">
            <dt className="text-xs font-medium text-slate-900">{name}</dt>
            <dd>
              <code className="block rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-800">
                {expression}
              </code>
            </dd>
            <dd className="text-xs text-slate-500">{note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
