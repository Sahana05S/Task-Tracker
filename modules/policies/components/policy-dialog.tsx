'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { ArrowLeftIcon, EyeIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { NativeSelect } from '@/shared/ui/native-select';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { USER_ROLES } from '@/shared/tracker/enums';

import { previewPolicyAction, savePolicyAction, type PreviewResult } from '@/modules/policies/actions';
import {
  OUTCOME_LABELS,
  PERIOD_LABELS,
  TEMPLATES,
  templateFor,
  type Audience,
  type MemberRole,
  type ParameterSpec,
  type Parameters,
  type PeriodKind,
  type PolicyTemplate,
  type Reward,
} from '@/modules/policies/client';
import { OutcomeDot } from '@/modules/policies/components/outcome-strip';
import type { AudienceMember as DialogMember } from '@/modules/policies/internal/workspace';

export type { AudienceMember as DialogMember } from '@/modules/policies/internal/workspace';

/** What an existing policy brings into the dialog (edit mode). */
export interface EditablePolicy {
  id: string;
  version: number;
  name: string;
  description: string;
  templateKey: string;
  parameters: Parameters;
  periodKind: PeriodKind;
  audience: Audience;
  reward: Reward;
}

/** Plural audience labels, in USER_ROLES order. */
const ROLE_LABELS = {
  managing_director: 'Managing director',
  project_engineer: 'Project engineers',
  data_manager: 'Data managers',
  team_member: 'Team members',
} satisfies Record<MemberRole, string>;

/** Reads the draft parameters from the form, falling back to the template's defaults. */
function draftParameters(template: PolicyTemplate, form: HTMLFormElement | null): Parameters {
  const params: Parameters = { ...template.defaults };
  if (!form) return params;
  const data = new FormData(form);
  for (const spec of template.parameters) {
    const raw = data.get(`param.${spec.key}`);
    if (spec.type === 'boolean') params[spec.key] = raw === 'on';
    else if (typeof raw === 'string' && raw !== '') params[spec.key] = spec.type === 'integer' || spec.type === 'number' ? Number(raw) : raw;
  }
  return params;
}

function ParameterInput({ spec, value }: { spec: ParameterSpec; value: Parameters[string] }) {
  const id = `policy-param-${spec.key}`;
  const name = `param.${spec.key}`;
  const describedBy = spec.help ? `${id}-hint` : undefined;
  if (spec.type === 'boolean') {
    return (
      <div className="grid gap-0.5">
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" name={name} defaultChecked={value === true} aria-describedby={describedBy} className="accent-primary size-4" />
          <span className="text-foreground font-medium">{spec.label}</span>
        </label>
        {spec.help ? <p id={`${id}-hint`} className="text-muted-foreground text-xs">{spec.help}</p> : null}
      </div>
    );
  }
  return (
    <Field id={id} label={spec.label} hint={spec.help}>
      {spec.type === 'choice' ? (
        <NativeSelect id={id} name={name} defaultValue={String(value)} aria-describedby={describedBy}>
          {spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </NativeSelect>
      ) : spec.type === 'time' ? (
        <input id={id} name={name} type="time" required autoComplete="off" defaultValue={String(value)} aria-describedby={describedBy} className="field h-11 w-36" />
      ) : (
        <div className="flex items-center gap-2">
          <input id={id} name={name} type="number" autoComplete="off" inputMode={spec.type === 'integer' ? 'numeric' : 'decimal'} required
            min={spec.min} max={spec.max} step={spec.step ?? 1} defaultValue={String(value)} aria-describedby={describedBy} className="field h-11 w-28 tabular-nums" />
          {spec.unit ? <span className="text-muted-foreground text-sm">{spec.unit}</span> : null}
        </div>
      )}
    </Field>
  );
}

function TemplatePicker({ onPick }: { onPick: (template: PolicyTemplate) => void }) {
  return (
    <div className="grid gap-2 px-5 pb-5">
      <p className="text-muted-foreground text-sm">Start from a rule. You can change its values on the next step.</p>
      <ul className="grid gap-2">
        {TEMPLATES.map((t) => (
          <li key={t.key}>
            <button type="button" onClick={() => onPick(t)}
              className="border-border hover:border-primary/40 hover:bg-primary-subtle/40 focus-visible:ring-ring grid w-full gap-0.5 rounded-xl border bg-card px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2">
              <span className="text-foreground text-sm font-semibold">{t.label}</span>
              <span className="text-muted-foreground text-xs text-pretty">{t.summary(t.defaults, t.periodKinds.includes('month') ? 'month' : t.periodKinds[0])}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Preview({ result }: { result: PreviewResult }) {
  const shown = result.rows.slice(0, 12);
  return (
    <div className="bg-muted/70 grid gap-2 rounded-xl px-3.5 py-3">
      <p className="text-foreground text-sm font-semibold">
        {result.members === 0 ? 'Nobody is in this audience yet.'
          : `${result.met} of ${result.members} would meet this for ${result.periodLabel}${result.final ? '' : ' so far'}.`}
      </p>
      {shown.length ? (
        <table className="w-full text-xs">
          <caption className="sr-only">Preview by member</caption>
          <thead className="sr-only"><tr><th>Member</th><th>Outcome</th><th>Main reason</th></tr></thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.employeeId} className="border-border border-t first:border-t-0 align-top">
                <td className="text-foreground py-1.5 pr-2 font-medium">{row.name}</td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <OutcomeDot outcome={row.outcome} />
                    {OUTCOME_LABELS[row.outcome][result.final ? 'final' : 'provisional']}
                  </span>
                </td>
                <td className="text-muted-foreground py-1.5">{row.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {result.rows.length > shown.length ? <p className="text-muted-foreground text-xs">and {result.rows.length - shown.length} more</p> : null}
    </div>
  );
}

function PolicyForm({ template, policy, members, onBack, onSaved, onDirty }: {
  template: PolicyTemplate;
  policy: EditablePolicy | null;
  members: DialogMember[];
  onBack: (() => void) | null;
  onSaved: () => void;
  onDirty: () => void;
}) {
  const formId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const initialParams = { ...template.defaults, ...(policy?.parameters ?? {}) };
  const [periodKind, setPeriodKind] = useState<PeriodKind>(
    policy?.periodKind ?? (template.periodKinds.includes('month') ? 'month' : template.periodKinds[0]));
  const [audienceKind, setAudienceKind] = useState<Audience['kind']>(policy?.audience.kind ?? 'everyone');
  const [params, setParams] = useState<Parameters>(initialParams);
  const [preview, setPreview] = useState<{ result?: PreviewResult; error?: string } | null>(null);
  const [previewing, startPreview] = useTransition();

  const form = () => wrapper.current?.closest('form') ?? null;
  const roles = policy?.audience.kind === 'roles' ? policy.audience.roles : [];
  const ids = policy?.audience.kind === 'members' ? policy.audience.ids : [];

  function runPreview() {
    const element = form();
    if (!element) return;
    const data = new FormData(element);
    startPreview(async () => {
      const response = await previewPolicyAction(data);
      setPreview(response.success && response.data ? { result: response.data } : { error: response.error ?? 'The preview did not run. Check the values and try again.' });
    });
  }

  return (
    <ExecutionForm action={savePolicyAction} scope={policy ? `policy:${policy.id}` : `policy:new:${template.key}`} onSuccess={onSaved} className="grid gap-4 px-5 pb-6">
      <div ref={wrapper} className="grid gap-5" onChange={() => { setParams(draftParameters(template, form())); setPreview(null); onDirty(); }}>
        <input type="hidden" name="templateKey" value={template.key} />
        <input type="hidden" name="periodKind" value={periodKind} />
        <input type="hidden" name="audienceKind" value={audienceKind} />
        {policy ? <><input type="hidden" name="policyId" value={policy.id} /><input type="hidden" name="expectedVersion" value={policy.version} /></> : null}

        <div className="border-primary/15 bg-primary-subtle/50 grid gap-1 rounded-xl border px-3.5 py-3">
          <p className="eyebrow">{template.label}</p>
          <p className="text-foreground text-sm font-medium text-pretty">{template.summary(params, periodKind)}</p>
          {onBack ? (
            <button type="button" onClick={onBack} className="link justify-self-start text-xs">
              <ArrowLeftIcon className="mr-1 inline size-3" aria-hidden="true" />Choose another rule
            </button>
          ) : null}
        </div>

        <Field id={`${formId}-name`} label="Name" required>
          <input id={`${formId}-name`} name="name" required maxLength={80} autoComplete="off" defaultValue={policy?.name ?? template.label} className="field h-11" />
        </Field>

        <div className="grid gap-1.5">
          <span aria-hidden="true" className="text-foreground text-sm font-medium">Judged every</span>
          <SegmentedControl label="Judged every" value={periodKind} onValueChange={(v) => { setPeriodKind(v); setPreview(null); }}
            options={template.periodKinds.map((k) => ({ value: k, label: PERIOD_LABELS[k].noun }))} />
        </div>

        {template.parameters.length ? (
          <fieldset className="grid gap-3 border-0 p-0">
            <legend className="text-foreground mb-1 text-sm font-semibold">Rule values</legend>
            {template.parameters.map((spec) => <ParameterInput key={spec.key} spec={spec} value={initialParams[spec.key]} />)}
          </fieldset>
        ) : null}

        <fieldset className="grid gap-2 border-0 p-0">
          <legend className="text-foreground mb-1 text-sm font-semibold">Applies to</legend>
          <SegmentedControl label="Applies to" value={audienceKind} onValueChange={(v) => { setAudienceKind(v); setPreview(null); }}
            options={[{ value: 'everyone', label: 'Everyone' }, { value: 'roles', label: 'Roles' }, { value: 'members', label: 'People' }]} />
          {audienceKind === 'roles' ? (
            <div className="grid gap-0.5">
              {USER_ROLES.map((role) => (
                <label key={role} className="flex min-h-11 items-center gap-2.5 text-sm">
                  <input type="checkbox" name="audienceRoles" value={role} defaultChecked={roles.includes(role)} className="accent-primary size-4" />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          ) : audienceKind === 'members' ? (
            <div className="border-border grid max-h-56 gap-0.5 overflow-y-auto overscroll-contain rounded-xl border px-3 py-1">
              {members.length ? members.map((m) => (
                <label key={m.id} className="flex min-h-11 items-center gap-2.5 text-sm">
                  <input type="checkbox" name="audienceIds" value={m.id} defaultChecked={ids.includes(m.id)} className="accent-primary size-4" />
                  <span className="min-w-0 truncate" title={m.name}>{m.name}</span>
                </label>
              )) : <p className="text-muted-foreground py-2 text-sm">The member list could not be loaded. Choose Everyone or Roles, or try again later.</p>}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="grid gap-3 border-0 p-0 sm:grid-cols-[1fr_auto]">
          <legend className="text-foreground mb-1 text-sm font-semibold">Commendation</legend>
          <Field id={`${formId}-badge`} label="Badge name" required>
            <input id={`${formId}-badge`} name="badge" required maxLength={40} autoComplete="off" defaultValue={policy?.reward.badge ?? template.defaultReward.badge} className="field h-11" />
          </Field>
          <Field id={`${formId}-points`} label="Recognition points" hint="0 to 1000; never part of performance scores">
            <input id={`${formId}-points`} name="points" type="number" autoComplete="off" inputMode="numeric" required min={0} max={1000} step={1}
              defaultValue={policy?.reward.points ?? template.defaultReward.points} aria-describedby={`${formId}-points-hint`} className="field h-11 w-28 tabular-nums" />
          </Field>
        </fieldset>

        <Field id={`${formId}-description`} label="Note for the team" hint="Optional. Shown under the rule.">
          <textarea id={`${formId}-description`} name="description" maxLength={500} rows={2} defaultValue={policy?.description ?? ''}
            aria-describedby={`${formId}-description-hint`} className="field min-h-20 py-2" />
        </Field>
        {policy ? (
          <Field id={`${formId}-reason`} label="What changed" hint="Optional. Kept with this version of the policy.">
            <input id={`${formId}-reason`} name="reason" maxLength={300} autoComplete="off" aria-describedby={`${formId}-reason-hint`} className="field h-11" />
          </Field>
        ) : null}

        <div className="grid gap-2">
          <Button type="button" variant="outline" onClick={runPreview} disabled={previewing} className="justify-self-start">
            <EyeIcon aria-hidden="true" />{previewing ? 'Checking this period…' : 'Preview this period'}
          </Button>
          <div aria-live="polite" className="grid gap-2 empty:hidden">
            {preview?.result ? <Preview result={preview.result} /> : null}
            {preview?.error ? <p className="text-danger text-sm">{preview.error}</p> : null}
          </div>
        </div>
      </div>
      <div className="border-border flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit">{policy ? 'Save changes' : 'Create policy'}</Button>
        <p className="text-muted-foreground text-xs">Results are checked every night, or now with Evaluate now.</p>
      </div>
    </ExecutionForm>
  );
}

/**
 * New policy or Edit: choose a template (new only), set its values, audience and
 * commendation, preview this period, save. The database validates again.
 */
export function PolicyDialog({ open, onOpenChange, policy, members }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: EditablePolicy | null;
  members: DialogMember[];
}) {
  const [picked, setPicked] = useState<PolicyTemplate | null>(null);
  const dirty = useRef(false);
  const template = policy ? templateFor(policy.templateKey) ?? null : picked;
  const close = () => { dirty.current = false; setPicked(null); onOpenChange(false); };
  return (
    <Sheet open={open} onOpenChange={(next) => {
      if (next) return onOpenChange(true);
      // Escape, the overlay and the close button would otherwise drop unsaved values.
      if (dirty.current && !window.confirm('Discard this policy? Your changes are not saved.')) return;
      close();
    }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="mb-4">
          <SheetTitle>{policy ? `Edit ${policy.name}` : template ? 'New policy' : 'New policy: choose a rule'}</SheetTitle>
          <SheetDescription>
            {policy ? 'Changes apply from the current period; closed periods keep the version they were judged by.'
              : 'Members who meet a policy get its badge, a congratulation and its recognition points.'}
          </SheetDescription>
        </SheetHeader>
        {template ? (
          <PolicyForm key={template.key} template={template} policy={policy} members={members}
            onBack={policy ? null : () => { dirty.current = false; setPicked(null); }} onSaved={close} onDirty={() => { dirty.current = true; }} />
        ) : policy ? (
          <p className="text-muted-foreground px-5 text-sm">This policy uses a rule this version of Stellar does not know, so it cannot be edited here.</p>
        ) : (
          <TemplatePicker onPick={setPicked} />
        )}
      </SheetContent>
    </Sheet>
  );
}
