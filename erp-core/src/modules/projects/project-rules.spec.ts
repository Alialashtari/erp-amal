import {
  attendanceRate,
  canTransitionProject,
  canTransitionTask,
  generateVerificationCode,
} from './project-rules';

describe('Project domain rules (FRS-007)', () => {
  it('project lifecycle legality', () => {
    expect(canTransitionProject('PLANNING', 'ACTIVE')).toBe(true);
    expect(canTransitionProject('PENDING_APPROVAL', 'ACTIVE')).toBe(true);
    expect(canTransitionProject('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransitionProject('COMPLETED', 'ARCHIVED')).toBe(true);
    expect(canTransitionProject('ARCHIVED', 'ACTIVE')).toBe(false);
    expect(canTransitionProject('PLANNING', 'COMPLETED')).toBe(false);
  });

  it('task lifecycle legality', () => {
    expect(canTransitionTask('TODO', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionTask('IN_PROGRESS', 'DONE')).toBe(true);
    expect(canTransitionTask('DONE', 'TODO')).toBe(false);
    expect(canTransitionTask('CANCELLED', 'IN_PROGRESS')).toBe(false);
  });

  it('verification codes are 12 chars, uppercase alphanumeric, unique-ish', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateVerificationCode()));
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9]{12}$/);
    expect(codes.size).toBe(100);
  });

  it('attendance rate counts PRESENT and LATE as attended', () => {
    expect(
      attendanceRate([
        { status: 'PRESENT' },
        { status: 'LATE' },
        { status: 'ABSENT' },
        { status: 'WITHDRAWN' },
      ]),
    ).toBe(50);
    expect(attendanceRate([])).toBeNull();
  });
});
