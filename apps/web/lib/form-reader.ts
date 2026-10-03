/**
 * Small helper for Server Actions that read a `<form>` submission. `formData.get()` returns
 * `FormDataEntryValue | null`, which can be a `File` — every field is therefore checked with
 * `typeof === 'string'` before use, and every parse failure is collected as a French message
 * so the action can return them all at once instead of failing on the first one.
 */
export class FormReader {
  readonly errors: string[] = [];

  constructor(private readonly formData: FormData) {}

  private raw(name: string): string | null {
    const value = this.formData.get(name);
    return typeof value === 'string' ? value.trim() : null;
  }

  /** Required non-empty text. */
  text(name: string, label: string, maxLength = 500): string {
    const value = this.raw(name);
    if (value === null || value.length === 0) {
      this.errors.push(`${label} : champ obligatoire.`);
      return '';
    }
    if (value.length > maxLength) {
      this.errors.push(`${label} : ${maxLength} caractères maximum.`);
      return value.slice(0, maxLength);
    }
    return value;
  }

  /** Optional text — empty string becomes null. */
  optionalText(name: string, label: string, maxLength = 500): string | null {
    const value = this.raw(name);
    if (value === null || value.length === 0) {
      return null;
    }
    if (value.length > maxLength) {
      this.errors.push(`${label} : ${maxLength} caractères maximum.`);
    }
    return value.slice(0, maxLength);
  }

  /** Required finite number, optionally bounded (inclusive). */
  number(name: string, label: string, bounds?: { min?: number; max?: number }): number {
    const value = this.raw(name);
    const parsed = value === null || value.length === 0 ? NaN : Number(value);
    if (!Number.isFinite(parsed)) {
      this.errors.push(`${label} : valeur numérique obligatoire.`);
      return 0;
    }
    return this.checkBounds(parsed, label, bounds);
  }

  /** Optional finite number — empty becomes null. */
  optionalNumber(name: string, label: string, bounds?: { min?: number; max?: number }): number | null {
    const value = this.raw(name);
    if (value === null || value.length === 0) {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      this.errors.push(`${label} : valeur numérique invalide.`);
      return null;
    }
    return this.checkBounds(parsed, label, bounds);
  }

  /** Required integer. */
  integer(name: string, label: string, bounds?: { min?: number; max?: number }): number {
    const parsed = this.number(name, label, bounds);
    if (!Number.isInteger(parsed)) {
      this.errors.push(`${label} : nombre entier attendu.`);
      return Math.trunc(parsed);
    }
    return parsed;
  }

  optionalInteger(name: string, label: string, bounds?: { min?: number; max?: number }): number | null {
    const parsed = this.optionalNumber(name, label, bounds);
    if (parsed !== null && !Number.isInteger(parsed)) {
      this.errors.push(`${label} : nombre entier attendu.`);
      return Math.trunc(parsed);
    }
    return parsed;
  }

  /** Required value from an allowed set. */
  oneOf<T extends string>(name: string, label: string, allowed: readonly T[]): T {
    const value = this.raw(name);
    if (value !== null && (allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    this.errors.push(`${label} : valeur invalide.`);
    return allowed[0] as T;
  }

  /** Optional value from an allowed set — empty becomes null. */
  optionalOneOf<T extends string>(name: string, label: string, allowed: readonly T[]): T | null {
    const value = this.raw(name);
    if (value === null || value.length === 0) {
      return null;
    }
    if ((allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    this.errors.push(`${label} : valeur invalide.`);
    return null;
  }

  /** Checkbox: present (any value) means true. */
  boolean(name: string): boolean {
    const value = this.formData.get(name);
    return value !== null && value !== 'false' && value !== 'off';
  }

  private checkBounds(value: number, label: string, bounds?: { min?: number; max?: number }): number {
    if (bounds?.min !== undefined && value < bounds.min) {
      this.errors.push(`${label} : doit être ≥ ${bounds.min}.`);
    }
    if (bounds?.max !== undefined && value > bounds.max) {
      this.errors.push(`${label} : doit être ≤ ${bounds.max}.`);
    }
    return value;
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  errorMessage(): string {
    return this.errors.join(' ');
  }
}
