import { DedupService } from './dedup.service';

describe('DedupService confidence scoring (FRS-001 §19)', () => {
  it('national id match is HIGH confidence', () => {
    expect(DedupService.scoreConfidence(['NATIONAL_ID'])).toBe('HIGH');
    expect(DedupService.scoreConfidence(['NATIONAL_ID', 'NAME'])).toBe('HIGH');
  });

  it('contact + name is HIGH confidence', () => {
    expect(DedupService.scoreConfidence(['CONTACT', 'NAME'])).toBe('HIGH');
  });

  it('contact alone is MEDIUM confidence', () => {
    expect(DedupService.scoreConfidence(['CONTACT'])).toBe('MEDIUM');
  });

  it('name alone is LOW confidence', () => {
    expect(DedupService.scoreConfidence(['NAME'])).toBe('LOW');
  });
});
