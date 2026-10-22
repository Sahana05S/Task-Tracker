'use client';

import { meetingTypeChoices } from '@/modules/settings/client';

import { useMeetingTypes } from './company-settings-context';

/**
 * The meeting-point "Meeting type" field: a select over the company's meeting
 * types, keeping a saved value that has left the list. A company that has not
 * set meeting types up keeps the free-text field.
 */
export function MeetingTypeSelect({ name = 'meeting_type', defaultValue, required = true }: { name?: string; defaultValue?: string | null; required?: boolean }) {
  const types = useMeetingTypes();
  if (types.length === 0) {
    return (
      <label className="field-label">
        Meeting type
        <input name={name} defaultValue={defaultValue ?? ''} required={required} maxLength={80} className="field" />
      </label>
    );
  }
  const choices = meetingTypeChoices(types, defaultValue);
  return (
    <label className="field-label">
      Meeting type
      <select name={name} defaultValue={defaultValue?.trim() || ''} required={required} className="field">
        <option value="" disabled>
          Choose a meeting type
        </option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}
