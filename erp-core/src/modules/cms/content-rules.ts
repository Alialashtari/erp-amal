import { ContentStatus } from '@prisma/client';

/**
 * Content lifecycle (FRS-010 publishing workflow: review → approve → publish).
 * Guarded transitions; archived content can be restored to DRAFT (Art. 4.4 —
 * archive, never delete).
 */
export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['APPROVED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['UNPUBLISHED'],
  UNPUBLISHED: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return (CONTENT_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Permission required to perform a given transition (separation of duties:
 * editors submit, reviewers approve, publishers publish).
 */
export function permissionForTransition(from: ContentStatus, to: ContentStatus): string {
  if (to === 'APPROVED' || (from === 'IN_REVIEW' && to === 'DRAFT')) return 'cms.review';
  if (to === 'PUBLISHED' || to === 'UNPUBLISHED') return 'cms.publish';
  return 'cms.manage';
}

/** Slug: lowercase latin/arabic letters, digits and hyphens. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9ء-ي]+(?:-[a-z0-9ء-ي]+)*$/.test(slug);
}
