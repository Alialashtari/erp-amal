import { maskPerson, maskValue } from './masking';

describe('CRM sensitive-field masking (ADR-016, FRS-001 §21)', () => {
  const person = {
    id: 'p1',
    fullName: 'Ali Hassan',
    nationalId: '199012345678',
    contacts: [{ id: 'c1', value: '+9647701234567' }],
    addresses: [{ id: 'a1', addressLine: 'Street 5, House 12', latitude: 32.6, longitude: 44.0 }],
  };

  it('masks national id, contacts, address lines and GPS without crm.view_sensitive', () => {
    const masked = maskPerson(person, false);
    expect(masked.nationalId).not.toContain('9012345');
    expect(masked.nationalId?.startsWith('19')).toBe(true);
    expect(masked.contacts?.[0].value).not.toContain('7701234');
    expect(masked.addresses?.[0].addressLine).toBe('****');
    expect(masked.addresses?.[0].latitude).toBeNull();
    expect(masked.addresses?.[0].longitude).toBeNull();
  });

  it('returns unmasked data with crm.view_sensitive', () => {
    const visible = maskPerson(person, true);
    expect(visible.nationalId).toBe('199012345678');
    expect(visible.contacts?.[0].value).toBe('+9647701234567');
    expect(visible.addresses?.[0].addressLine).toBe('Street 5, House 12');
  });

  it('does not leak short values', () => {
    expect(maskValue('123')).toBe('****');
  });

  it('never masks non-sensitive fields', () => {
    expect(maskPerson(person, false).fullName).toBe('Ali Hassan');
  });
});
