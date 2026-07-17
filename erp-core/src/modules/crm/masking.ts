/**
 * Sensitive-field masking (ADR-016; FRS-001 §21 "View Sensitive Information").
 * Users without `crm.view_sensitive` see masked national ids, contact values,
 * address lines and GPS coordinates.
 */

export function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-2)}`;
}

interface PersonLike {
  nationalId?: string | null;
  dateOfBirth?: Date | string | null;
  contacts?: { value: string; [k: string]: unknown }[];
  addresses?: {
    addressLine?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    [k: string]: unknown;
  }[];
  [k: string]: unknown;
}

export function maskPerson<T extends PersonLike>(person: T, canViewSensitive: boolean): T {
  if (canViewSensitive) return person;
  return {
    ...person,
    nationalId: person.nationalId ? maskValue(person.nationalId) : person.nationalId,
    contacts: person.contacts?.map((c) => ({ ...c, value: maskValue(c.value) })),
    addresses: person.addresses?.map((a) => ({
      ...a,
      addressLine: a.addressLine ? '****' : a.addressLine,
      latitude: a.latitude != null ? null : a.latitude,
      longitude: a.longitude != null ? null : a.longitude,
    })),
  };
}
