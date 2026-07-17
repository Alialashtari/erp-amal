import { CrmScopeService } from './scope.service';

describe('CRM data scoping filter (ADR-016)', () => {
  it('returns an unrestricted filter when the user has no scope rules', () => {
    expect(CrmScopeService.buildPersonWhere([])).toEqual({});
  });

  it('restricts to the scoped governorates', () => {
    expect(CrmScopeService.buildPersonWhere(['Karbala', 'Najaf'])).toEqual({
      addresses: { some: { governorate: { in: ['Karbala', 'Najaf'] } } },
    });
  });
});
