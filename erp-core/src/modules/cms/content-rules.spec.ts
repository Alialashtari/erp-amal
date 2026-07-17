import {
  canTransition,
  isValidSlug,
  permissionForTransition,
} from './content-rules';

describe('content lifecycle rules (FRS-010)', () => {
  it('follows draft → review → approved → published', () => {
    expect(canTransition('DRAFT', 'IN_REVIEW')).toBe(true);
    expect(canTransition('IN_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'PUBLISHED')).toBe(true);
  });

  it('forbids skipping review or publishing drafts directly', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition('IN_REVIEW', 'PUBLISHED')).toBe(false);
  });

  it('supports unpublish, archive and restore (no hard delete, Art. 4.4)', () => {
    expect(canTransition('PUBLISHED', 'UNPUBLISHED')).toBe(true);
    expect(canTransition('UNPUBLISHED', 'PUBLISHED')).toBe(true);
    expect(canTransition('UNPUBLISHED', 'ARCHIVED')).toBe(true);
    expect(canTransition('ARCHIVED', 'DRAFT')).toBe(true);
    expect(canTransition('PUBLISHED', 'ARCHIVED')).toBe(false);
  });

  it('separates duties: review vs publish vs manage', () => {
    expect(permissionForTransition('IN_REVIEW', 'APPROVED')).toBe('cms.review');
    expect(permissionForTransition('IN_REVIEW', 'DRAFT')).toBe('cms.review');
    expect(permissionForTransition('APPROVED', 'PUBLISHED')).toBe('cms.publish');
    expect(permissionForTransition('PUBLISHED', 'UNPUBLISHED')).toBe('cms.publish');
    expect(permissionForTransition('DRAFT', 'IN_REVIEW')).toBe('cms.manage');
    expect(permissionForTransition('DRAFT', 'ARCHIVED')).toBe('cms.manage');
  });

  it('validates slugs (latin + arabic, hyphen separated)', () => {
    expect(isValidSlug('about-us')).toBe(true);
    expect(isValidSlug('من-نحن')).toBe(true);
    expect(isValidSlug('news-2026')).toBe(true);
    expect(isValidSlug('Bad Slug')).toBe(false);
    expect(isValidSlug('-leading')).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });
});
