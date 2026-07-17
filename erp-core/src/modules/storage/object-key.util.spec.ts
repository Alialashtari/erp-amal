import { buildObjectKey, isForbiddenExtension, sanitizeFileName, sanitizeSegment } from './object-key.util';

describe('Storage object keys and upload safety (Art. 3.5, 6.1)', () => {
  it('builds module/yyyy/mm/uuid-name keys', () => {
    const key = buildObjectKey('medical', 'report.pdf', new Date(Date.UTC(2026, 0, 15)));
    expect(key).toMatch(/^medical\/2026\/01\/[0-9a-f-]{36}-report\.pdf$/);
  });

  it('sanitizes module segments', () => {
    expect(sanitizeSegment('Medical Files!')).toBe('medical-files-');
  });

  it('strips path traversal from file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('a\\b\\evil.txt')).toBe('evil.txt');
  });

  it('keeps Arabic file names', () => {
    expect(sanitizeFileName('تقرير طبي.pdf')).toBe('تقرير_طبي.pdf');
  });

  it('rejects executable extensions', () => {
    expect(isForbiddenExtension('malware.exe')).toBe(true);
    expect(isForbiddenExtension('script.sh')).toBe(true);
    expect(isForbiddenExtension('report.pdf')).toBe(false);
    expect(isForbiddenExtension('photo.JPG')).toBe(false);
  });
});
