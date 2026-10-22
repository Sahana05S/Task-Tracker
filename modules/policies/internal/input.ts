// PRIVATE. Parses the policy dialog's FormData into a definition. Friendly
// messages only: policy_command validates the shape again.
import { readString as text, UUID_PATTERN } from '@/shared/forms/form-data';
import { isUserRole } from '@/shared/tracker/enums';

import { templateFor, type ParameterSpec } from './templates';
import type { Audience, Parameters, ParameterValue, PeriodKind, PolicyDefinition } from './types';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseParameter(spec: ParameterSpec, raw: string): Parsed<ParameterValue> {
  switch (spec.type) {
    case 'time':
      return TIME.test(raw) ? { ok: true, value: raw } : { ok: false, error: `${spec.label}: use a 24-hour time such as 09:30.` };
    case 'boolean':
      return { ok: true, value: raw === 'on' || raw === 'true' };
    case 'choice':
      return spec.options.some((o) => o.value === raw) ? { ok: true, value: raw } : { ok: false, error: `${spec.label}: choose one of the options.` };
    default: {
      const value = Number(raw);
      const whole = spec.type === 'integer';
      if (raw === '' || !Number.isFinite(value) || (whole && !Number.isInteger(value)) || value < spec.min || value > spec.max) {
        return { ok: false, error: `${spec.label}: enter ${whole ? 'a whole number' : 'a number'} from ${spec.min} to ${spec.max}.` };
      }
      if (spec.step && Math.abs(value / spec.step - Math.round(value / spec.step)) > 1e-9) {
        return { ok: false, error: `${spec.label}: use steps of ${spec.step}.` };
      }
      return { ok: true, value };
    }
  }
}

function parseAudience(form: FormData): Parsed<Audience> {
  const kind = text(form, 'audienceKind') || 'everyone';
  if (kind === 'everyone') return { ok: true, value: { kind } };
  if (kind === 'roles') {
    const roles = form.getAll('audienceRoles').map(String).filter(isUserRole);
    return roles.length ? { ok: true, value: { kind, roles: [...new Set(roles)] } } : { ok: false, error: 'Pick at least one role.' };
  }
  if (kind === 'members') {
    const ids = [...new Set(form.getAll('audienceIds').map(String).filter((id) => UUID_PATTERN.test(id)))];
    return ids.length ? { ok: true, value: { kind, ids } } : { ok: false, error: 'Pick at least one member.' };
  }
  return { ok: false, error: 'Choose who the policy applies to.' };
}

export function parsePolicyForm(form: FormData): Parsed<PolicyDefinition> {
  const template = templateFor(text(form, 'templateKey'));
  if (!template) return { ok: false, error: 'Choose a template.' };
  const name = text(form, 'name');
  if (!name || name.length > 80) return { ok: false, error: 'Give the policy a name of up to 80 characters.' };
  const description = text(form, 'description');
  if (description.length > 500) return { ok: false, error: 'Keep the description under 500 characters.' };
  const periodKind = text(form, 'periodKind') as PeriodKind;
  if (!template.periodKinds.includes(periodKind)) return { ok: false, error: `This template works per ${template.periodKinds.join(', ')}.` };

  const parameters: Parameters = {};
  for (const spec of template.parameters) {
    const parsed = parseParameter(spec, text(form, `param.${spec.key}`));
    if (!parsed.ok) return parsed;
    parameters[spec.key] = parsed.value;
  }
  const audience = parseAudience(form);
  if (!audience.ok) return audience;

  const badge = text(form, 'badge');
  if (!badge || badge.length > 40) return { ok: false, error: 'Name the badge (up to 40 characters).' };
  const points = Number(text(form, 'points'));
  if (!Number.isInteger(points) || points < 0 || points > 1000) return { ok: false, error: 'Recognition points must be a whole number from 0 to 1000.' };

  return {
    ok: true,
    value: {
      name, description, templateKey: template.key, parameters, periodKind, audience: audience.value,
      reward: { kind: 'commendation', badge, points }, ruleVersion: template.ruleVersion,
    },
  };
}
