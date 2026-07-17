import { ScopingService } from './scoping.service';

describe('Generalized data scoping (ADR-016)', () => {
  it('person filter: empty = unrestricted, else governorate relation filter', () => {
    expect(ScopingService.personWhere([])).toEqual({});
    expect(ScopingService.personWhere(['Karbala'])).toEqual({
      addresses: { some: { governorate: { in: ['Karbala'] } } },
    });
  });

  it('project filter: scoped ids, optionally OR own-managed projects', () => {
    expect(ScopingService.projectWhere([])).toEqual({});
    expect(ScopingService.projectWhere(['p1', 'p2'])).toEqual({ id: { in: ['p1', 'p2'] } });
    expect(ScopingService.projectWhere(['p1'], 'u1')).toEqual({
      OR: [{ id: { in: ['p1'] } }, { managerId: 'u1' }],
    });
  });

  it('team filter by department', () => {
    expect(ScopingService.teamWhere([])).toEqual({});
    expect(ScopingService.teamWhere(['MEDIA'])).toEqual({ department: { in: ['MEDIA'] } });
  });

  it('person-id filter: null = unrestricted, list restricts', () => {
    expect(ScopingService.personIdWhere('patientPersonId', null)).toEqual({});
    expect(ScopingService.personIdWhere('patientPersonId', ['a', 'b'])).toEqual({
      patientPersonId: { in: ['a', 'b'] },
    });
  });
});
