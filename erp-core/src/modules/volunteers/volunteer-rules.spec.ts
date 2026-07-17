import { canTransitionVolunteer, totalApprovedHours, validateScores } from './volunteer-rules';

describe('Volunteer domain rules (FRS-008)', () => {
  it('status lifecycle legality', () => {
    expect(canTransitionVolunteer('APPLICANT', 'REVIEW')).toBe(true);
    expect(canTransitionVolunteer('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionVolunteer('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(canTransitionVolunteer('INACTIVE', 'ACTIVE')).toBe(true);
    expect(canTransitionVolunteer('ARCHIVED', 'ACTIVE')).toBe(false);
    expect(canTransitionVolunteer('APPLICANT', 'ACTIVE')).toBe(false); // only via workflow
  });

  it('sums only approved hours', () => {
    expect(
      totalApprovedHours([
        { status: 'APPROVED', hours: 3.5 },
        { status: 'APPROVED', hours: 2 },
        { status: 'PENDING', hours: 10 },
        { status: 'REJECTED', hours: 4 },
      ]),
    ).toBe(5.5);
  });

  it('validates evaluation scores', () => {
    expect(validateScores({ commitment: 5, attendance: 4 })).toBeNull();
    expect(validateScores({})).toMatch(/at least one/i);
    expect(validateScores({ unknown_criterion: 3 })).toMatch(/Unknown criterion/);
    expect(validateScores({ commitment: 6 })).toMatch(/between 1 and 5/);
    expect(validateScores({ commitment: 2.5 })).toMatch(/between 1 and 5/);
  });
});
