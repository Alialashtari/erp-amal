import { randomUUID } from 'crypto';

/**
 * Object key layout (DMS spec: module/year/month/file):
 *   <module>/<yyyy>/<mm>/<uuid>-<sanitized-name>
 * Keys are immutable once written; new versions get new keys.
 */
export function buildObjectKey(module: string, fileName: string, now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${sanitizeSegment(module)}/${yyyy}/${mm}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function sanitizeSegment(segment: string): string {
  return segment.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

/** Keeps unicode letters (Arabic names) but strips path separators, reserved and control chars. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'file';
  const withoutControlChars = Array.from(base)
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('');
  return withoutControlChars
    .replace(/\s+/g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .slice(0, 180);
}

const FORBIDDEN_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'msi', 'com', 'scr', 'ps1', 'vbs', 'js', 'jar', 'app', 'dmg',
]);

/** Secure-upload rule (Constitution Art. 6.1): executables are rejected. */
export function isForbiddenExtension(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FORBIDDEN_EXTENSIONS.has(ext);
}
