import type { Option } from '../lib/labels';

/** A labelled `<select>` with an optional empty choice — shared by every section form. */
export function SelectField<T extends string | number>({
  name,
  label,
  options,
  defaultValue,
  allowEmpty,
  required,
  hint,
  disabled,
}: {
  name: string;
  label: string;
  options: Option<T>[];
  defaultValue?: T | null | undefined;
  allowEmpty?: boolean | undefined;
  required?: boolean | undefined;
  hint?: string | undefined;
  disabled?: boolean | undefined;
}): React.JSX.Element {
  return (
    <label>
      {label}
      <select name={name} defaultValue={defaultValue === null || defaultValue === undefined ? '' : String(defaultValue)} required={required} disabled={disabled}>
        {allowEmpty && <option value="">—</option>}
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export interface EquipmentOption {
  id: string;
  label: string;
  isPrivate: boolean;
}

export function equipmentOptions(items: EquipmentOption[]): Option[] {
  return items.map((item) => ({ value: item.id, label: item.isPrivate ? `${item.label} (privé)` : item.label }));
}
